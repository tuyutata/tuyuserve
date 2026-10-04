import { readUserByTuyuId } from '../../account/cloud/repository';
import { ApiError, jsonResponse, readJson } from '../shared/api';
import {
  assertAccountId,
  assertMerchantInstanceId,
  assertTuyuId,
  createId,
} from '../shared/ids';
import { nowMs } from '../shared/time';
import { assertSecurePublicUrl, requireMerchantSession, requireSession } from '../request_guard';
import type { Env } from '../types';

interface RegisterRequest {
  merchant_instance_id?: unknown;
  installation_public_key?: unknown;
  installation_name?: unknown;
  merchant_type?: unknown;
  service_endpoint?: unknown;
}

interface GrantRequest {
  merchant_instance_id?: unknown;
  administrator_tuyu_id?: unknown;
}

const MERCHANT_TYPES = ['hotel', 'restaurant', 'tour', 'scenic', 'mixed'] as const;

export async function registerMerchantInstance(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env, 'tuyubooking');
  const body = await readJson<RegisterRequest>(request);
  let merchantInstanceId: string;
  let installationPublicKey: string;
  let serviceEndpoint: string | null = null;
  try {
    merchantInstanceId = assertMerchantInstanceId(body.merchant_instance_id);
    installationPublicKey = assertAccountId(body.installation_public_key);
    if (body.service_endpoint !== undefined && body.service_endpoint !== null) {
      serviceEndpoint = assertSecurePublicUrl(String(body.service_endpoint)).toString();
    }
  } catch {
    throw new ApiError(400, 'invalid_merchant_instance', '商家端注册参数不合法');
  }
  if (
    typeof body.installation_name !== 'string'
    || body.installation_name.length < 1
    || body.installation_name.length > 128
    || !MERCHANT_TYPES.includes(body.merchant_type as typeof MERCHANT_TYPES[number])
  ) {
    throw new ApiError(400, 'invalid_merchant_instance', '商家端注册参数不合法');
  }
  const timestamp = nowMs();
  await env.DB.prepare(
    `INSERT INTO merchant_instances
      (merchant_instance_id, merchant_tuyu_id, installation_public_key, installation_name,
       merchant_type, service_endpoint, status, registered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(
    merchantInstanceId,
    session.tuyu_id,
    installationPublicKey,
    body.installation_name,
    body.merchant_type,
    serviceEndpoint,
    timestamp,
    timestamp,
  ).run();
  await securityEvent(env, session, 'merchant_instance_registered', merchantInstanceId);
  return jsonResponse({
    ok: true,
    merchant_instance_id: merchantInstanceId,
    merchant_tuyu_id: session.tuyu_id,
    role: 'MERCHANT_OWNER',
  }, 201);
}

export async function grantMerchantAdministrator(request: Request, env: Env): Promise<Response> {
  const body = await readJson<GrantRequest>(request);
  let merchantInstanceId: string;
  let administratorTuyuId: string;
  try {
    merchantInstanceId = assertMerchantInstanceId(body.merchant_instance_id);
    administratorTuyuId = assertTuyuId(body.administrator_tuyu_id);
  } catch {
    throw new ApiError(400, 'invalid_merchant_grant', '管理员授权参数不合法');
  }
  const session = await requireMerchantSession(
    request,
    env,
    merchantInstanceId,
    ['MERCHANT_OWNER'],
  );
  if (administratorTuyuId === session.tuyu_id) {
    throw new ApiError(409, 'owner_grant_not_allowed', '商家所属途遇号不需要管理员授权');
  }
  const administrator = await readUserByTuyuId(env, administratorTuyuId);
  if (!administrator || administrator.status !== 'active') {
    throw new ApiError(404, 'administrator_unavailable', '管理员途遇号不可用');
  }
  const timestamp = nowMs();
  await env.DB.prepare(
    `INSERT INTO merchant_instance_grants
      (merchant_instance_id, administrator_tuyu_id, role, status, granted_by_tuyu_id,
       granted_by_signer_id, granted_at, revoked_at)
      VALUES (?, ?, 'MERCHANT_ADMIN', 'active', ?, ?, ?, NULL)
      ON CONFLICT (merchant_instance_id, administrator_tuyu_id) DO UPDATE SET
        status='active', granted_by_tuyu_id=excluded.granted_by_tuyu_id,
        granted_by_signer_id=excluded.granted_by_signer_id,
        granted_at=excluded.granted_at, revoked_at=NULL`,
  ).bind(
    merchantInstanceId,
    administratorTuyuId,
    session.tuyu_id,
    session.signer_id,
    timestamp,
  ).run();
  await securityEvent(env, session, 'merchant_administrator_granted', merchantInstanceId);
  return jsonResponse({ ok: true, merchant_instance_id: merchantInstanceId,
    administrator_tuyu_id: administratorTuyuId, role: 'MERCHANT_ADMIN' });
}

export async function revokeMerchantAdministrator(request: Request, env: Env): Promise<Response> {
  const body = await readJson<GrantRequest>(request);
  let merchantInstanceId: string;
  let administratorTuyuId: string;
  try {
    merchantInstanceId = assertMerchantInstanceId(body.merchant_instance_id);
    administratorTuyuId = assertTuyuId(body.administrator_tuyu_id);
  } catch {
    throw new ApiError(400, 'invalid_merchant_grant', '管理员撤销参数不合法');
  }
  const session = await requireMerchantSession(
    request,
    env,
    merchantInstanceId,
    ['MERCHANT_OWNER'],
  );
  if (administratorTuyuId === session.tuyu_id) {
    throw new ApiError(409, 'owner_revocation_forbidden', '不能撤销商家所属途遇号');
  }
  const changed = await env.DB.prepare(
    `UPDATE merchant_instance_grants SET status='revoked', revoked_at=?
      WHERE merchant_instance_id=? AND administrator_tuyu_id=? AND status='active'`,
  ).bind(nowMs(), merchantInstanceId, administratorTuyuId).run();
  if ((changed.meta?.changes ?? 0) !== 1) {
    throw new ApiError(404, 'merchant_grant_not_found', '商家端管理员授权不存在');
  }
  await securityEvent(env, session, 'merchant_administrator_revoked', merchantInstanceId);
  return jsonResponse({ ok: true });
}

async function securityEvent(
  env: Env,
  session: { tuyu_id: string; signer_id: string; audience: string; device_id: string },
  eventType: string,
  merchantInstanceId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO security_events
      (event_id, tuyu_id, event_type, audience, device_id, signer_id,
       merchant_instance_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    createId('tye'),
    session.tuyu_id,
    eventType,
    session.audience,
    session.device_id,
    session.signer_id,
    merchantInstanceId,
    nowMs(),
  ).run();
}
