import { readActiveSigner, readUserByTuyuId } from './repository';
import { ApiError, jsonResponse, parsePositiveInt, readJson } from '../../src/shared/api';
import {
  assertAccountId, assertAudience, assertDeviceId, assertTuyuId, createId,
} from '../../src/shared/ids';
import {
  bytesToHex, concatBytes, hexToBytes, OP_SIGN_TUYU_LOGIN, scaleString,
  signingMessage, u64Le,
} from '../../src/shared/signing_message';
import { millisecondsFromNow, nowMs } from '../../src/shared/time';
import type { Env, LoginChallengeRow, SessionState, TuyuAudience } from '../../src/types';
import { deleteSession, storeSession } from './session';
import { verifyWalletSignature } from './signature';

interface ChallengeRequest {
  tuyu_id?: unknown;
  account_id?: unknown;
  audience?: unknown;
  device_id?: unknown;
}
interface SessionRequest { tuyu_id?: unknown; challenge_id?: unknown; signature?: unknown }

export function buildLoginScalePayload(input: {
  tuyuId: string;
  signerId: string;
  keyRevision: number;
  accountId: string;
  audience: TuyuAudience;
  challengeId: string;
  deviceId: string;
  expiresAt: number;
}): Uint8Array {
  return concatBytes(
    scaleString(input.tuyuId),
    scaleString(input.signerId),
    u64Le(input.keyRevision),
    scaleString(input.accountId),
    scaleString(input.audience),
    scaleString(input.challengeId),
    scaleString(input.deviceId),
    u64Le(input.expiresAt),
  );
}

export async function createLoginChallenge(request: Request, env: Env): Promise<Response> {
  const body = await readJson<ChallengeRequest>(request);
  let tuyuId: string;
  let accountId: string;
  let audience: TuyuAudience;
  let deviceId: string;
  try {
    tuyuId = assertTuyuId(body.tuyu_id);
    accountId = assertAccountId(body.account_id);
    audience = assertAudience(body.audience);
    deviceId = assertDeviceId(body.device_id);
  } catch {
    throw new ApiError(400, 'invalid_challenge_request', '登录挑战参数不合法');
  }
  const [user, signer] = await Promise.all([
    readUserByTuyuId(env, tuyuId),
    readActiveSigner(env, tuyuId, accountId),
  ]);
  if (!user || user.status !== 'active' || !signer || signer.device_id !== deviceId) {
    throw new ApiError(401, 'identity_unavailable', '途遇号或签名账户不可用');
  }
  const challengeId = createId('tyc');
  const expiresAt = millisecondsFromNow(parsePositiveInt(env.CHALLENGE_TTL_SECONDS, 300));
  const signingPayload = bytesToHex(buildLoginScalePayload({
    tuyuId, signerId: signer.signer_id, keyRevision: signer.key_revision,
    accountId: signer.account_id, audience, challengeId, deviceId, expiresAt,
  }));
  await env.DB.prepare(
    `INSERT INTO login_challenges
      (challenge_id, tuyu_id, signer_id, key_revision, account_id, audience, device_id,
        signing_payload, expires_at, used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).bind(
    challengeId, tuyuId, signer.signer_id, signer.key_revision, signer.account_id,
    audience, deviceId, signingPayload, expiresAt,
  ).run();
  return jsonResponse({
    ok: true, challenge_id: challengeId, tuyu_id: tuyuId,
    signer_id: signer.signer_id, key_revision: signer.key_revision,
    account_id: signer.account_id, audience, device_id: deviceId,
    operation: OP_SIGN_TUYU_LOGIN, signing_payload_hex: signingPayload,
    expires_at: expiresAt,
  });
}

export async function createSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<SessionRequest>(request);
  if (typeof body.challenge_id !== 'string' || !body.challenge_id.startsWith('tyc_')
      || typeof body.signature !== 'string') {
    throw new ApiError(400, 'invalid_session_request', '登录请求缺少挑战或签名');
  }
  let tuyuId: string;
  try { tuyuId = assertTuyuId(body.tuyu_id); } catch {
    throw new ApiError(400, 'invalid_session_request', '登录请求参数不合法');
  }
  const challenge = await env.DB.prepare(
    `SELECT challenge_id, tuyu_id, signer_id, key_revision, account_id, audience, device_id,
      signing_payload, expires_at, used_at
      FROM login_challenges WHERE challenge_id = ?`,
  ).bind(body.challenge_id).first<LoginChallengeRow>();
  if (!challenge || challenge.tuyu_id !== tuyuId) {
    throw new ApiError(401, 'invalid_challenge', '登录挑战无效');
  }
  if (challenge.used_at !== null) throw new ApiError(401, 'used_challenge', '登录挑战已使用');
  if (challenge.expires_at <= nowMs()) throw new ApiError(401, 'expired_challenge', '登录挑战已过期');
  const [user, signer] = await Promise.all([
    readUserByTuyuId(env, tuyuId), readActiveSigner(env, tuyuId, challenge.account_id),
  ]);
  if (!user || user.status !== 'active' || !signer
      || signer.signer_id !== challenge.signer_id
      || signer.key_revision !== challenge.key_revision
      || signer.device_id !== challenge.device_id) {
    throw new ApiError(401, 'identity_binding_changed', '途遇号签名账户已变化，请重新登录');
  }
  const message = signingMessage(OP_SIGN_TUYU_LOGIN, hexToBytes(challenge.signing_payload));
  if (!await verifyWalletSignature(message, body.signature, challenge.account_id)) {
    throw new ApiError(401, 'invalid_signature', '途遇号签名验证失败');
  }
  const claimedAt = nowMs();
  const claimed = await env.DB.prepare(
    `UPDATE login_challenges SET used_at = ?
      WHERE challenge_id = ? AND tuyu_id = ? AND signer_id = ? AND key_revision = ?
        AND account_id = ? AND audience = ? AND device_id = ?
        AND used_at IS NULL AND expires_at > ?`,
  ).bind(
    claimedAt, challenge.challenge_id, challenge.tuyu_id, challenge.signer_id,
    challenge.key_revision, challenge.account_id, challenge.audience,
    challenge.device_id, claimedAt,
  ).run();
  if ((claimed.meta?.changes ?? 0) !== 1) {
    throw new ApiError(401, 'used_challenge', '登录挑战已使用');
  }
  const ttl = parsePositiveInt(env.SESSION_TTL_SECONDS, 28_800);
  const sessionToken = createId('tys');
  const session: SessionState = {
    tuyu_id: challenge.tuyu_id, signer_id: challenge.signer_id,
    key_revision: challenge.key_revision, account_id: challenge.account_id,
    audience: challenge.audience, device_id: challenge.device_id,
    created_at: claimedAt,
    expires_at: millisecondsFromNow(ttl),
  };
  await storeSession(env, sessionToken, session, ttl);
  return jsonResponse({
    ok: true, session_token: sessionToken, tuyu_id: session.tuyu_id,
    signer_id: session.signer_id, key_revision: session.key_revision,
    account_id: session.account_id, audience: session.audience,
    device_id: session.device_id, expires_at: session.expires_at,
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError(401, 'missing_session', '登录会话缺失');
  }
  await deleteSession(env, authorization.slice('Bearer '.length));
  return jsonResponse({ ok: true });
}
