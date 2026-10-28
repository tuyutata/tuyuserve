import { readUserByTuyuId } from '../../account/cloud/repository';
import { ApiError, jsonResponse, readJson } from '../shared/api';
import {
  assertAccountId,
  assertInstanceId,
  assertTuyuId,
  createId,
} from '../shared/ids';
import { nowMs } from '../shared/time';
import { assertSecurePublicUrl, requireMerchantSession, requireSession } from '../request_guard';
import type { Env } from '../types';

interface RegisterRequest {
  instance_id?: unknown;
  instance_key?: unknown;
  instance_name?: unknown;
  merchant_type?: unknown;
  service_endpoint?: unknown;
}

interface GrantRequest {
  instance_id?: unknown;
  admin_id?: unknown;
}

const MERCHANT_TYPES = ['hotel', 'restaurant', 'tour', 'scenic', 'mixed'] as const;

export async function registerMerchantInstance(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env, 'tuyubooking');
  const body = await readJson<RegisterRequest>(request);
  let instanceId: string;
  let instanceKey: string;
  let serviceEndpoint: string | null = null;
  try {
    instanceId = assertInstanceId(body.instance_id);
    instanceKey = assertAccountId(body.instance_key);
    if (body.service_endpoint !== undefined && body.service_endpoint !== null) {
      serviceEndpoint = assertSecurePublicUrl(String(body.service_endpoint)).toString();
    }
  } catch {
    throw new ApiError(400, 'invalid_merchant_instance', '商家端注册参数不合法');
  }
  if (
    typeof body.instance_name !== 'string'
    || body.instance_name.length < 1
    || body.instance_name.length > 128
    || !MERCHANT_TYPES.includes(body.merchant_type as typeof MERCHANT_TYPES[number])
  ) {
    throw new ApiError(400, 'invalid_merchant_instance', '商家端注册参数不合法');
  }
  const timestamp = nowMs();
  await env.DB.prepare(
    `INSERT INTO instances
      (instance_id, owner_id, instance_key, instance_name,
       merchant_type, service_endpoint, instance_state, registered_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(
    instanceId,
    session.tuyu_id,
    instanceKey,
    body.instance_name,
    body.merchant_type,
    serviceEndpoint,
    timestamp,
    timestamp,
  ).run();
  await securityEvent(env, session, 'merchant_instance_registered', instanceId);
  return jsonResponse({
    ok: true,
    instance_id: instanceId,
    owner_id: session.tuyu_id,
    role: 'MERCHANT_OWNER',
  }, 201);
}

export async function grantMerchantAdministrator(request: Request, env: Env): Promise<Response> {
  const body = await readJson<GrantRequest>(request);
  let instanceId: string;
  let adminId: string;
  try {
    instanceId = assertInstanceId(body.instance_id);
    adminId = assertTuyuId(body.admin_id);
  } catch {
    throw new ApiError(400, 'invalid_merchant_grant', '管理员授权参数不合法');
  }
  const session = await requireMerchantSession(
    request,
    env,
    instanceId,
    ['MERCHANT_OWNER'],
  );
  if (adminId === session.tuyu_id) {
    throw new ApiError(409, 'owner_grant_not_allowed', '商家所属途遇号不需要管理员授权');
  }
  const administrator = await readUserByTuyuId(env, adminId);
  if (!administrator || administrator.user_state !== 'active') {
    throw new ApiError(404, 'administrator_unavailable', '管理员途遇号不可用');
  }
  const timestamp = nowMs();
  await env.DB.prepare(
    `INSERT INTO grants
      (instance_id, admin_id, grant_state, issuer_id,
       issuer_signer, granted_at, revoked_at)
      VALUES (?, ?, 'active', ?, ?, ?, NULL)
      ON CONFLICT (instance_id, admin_id) DO UPDATE SET
        grant_state='active', issuer_id=excluded.issuer_id,
        issuer_signer=excluded.issuer_signer,
        granted_at=excluded.granted_at, revoked_at=NULL`,
  ).bind(
    instanceId,
    adminId,
    session.tuyu_id,
    session.signer_id,
    timestamp,
  ).run();
  await securityEvent(env, session, 'merchant_administrator_granted', instanceId);
  return jsonResponse({ ok: true, instance_id: instanceId,
    admin_id: adminId, role: 'MERCHANT_ADMIN' });
}

export async function revokeMerchantAdministrator(request: Request, env: Env): Promise<Response> {
  const body = await readJson<GrantRequest>(request);
  let instanceId: string;
  let adminId: string;
  try {
    instanceId = assertInstanceId(body.instance_id);
    adminId = assertTuyuId(body.admin_id);
  } catch {
    throw new ApiError(400, 'invalid_merchant_grant', '管理员撤销参数不合法');
  }
  const session = await requireMerchantSession(
    request,
    env,
    instanceId,
    ['MERCHANT_OWNER'],
  );
  if (adminId === session.tuyu_id) {
    throw new ApiError(409, 'owner_revocation_forbidden', '不能撤销商家所属途遇号');
  }
  const changed = await env.DB.prepare(
    `UPDATE grants SET grant_state='revoked', revoked_at=?
      WHERE instance_id=? AND admin_id=? AND grant_state='active'`,
  ).bind(nowMs(), instanceId, adminId).run();
  if ((changed.meta?.changes ?? 0) !== 1) {
    throw new ApiError(404, 'merchant_grant_not_found', '商家端管理员授权不存在');
  }
  await securityEvent(env, session, 'merchant_administrator_revoked', instanceId);
  return jsonResponse({ ok: true });
}

async function securityEvent(
  env: Env,
  session: { tuyu_id: string; signer_id: string; product_id: string; device_id: string },
  eventType: string,
  instanceId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO events
      (event_id, tuyu_id, event_type, product_id, device_id, signer_id,
       instance_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    createId('tye'),
    session.tuyu_id,
    eventType,
    session.product_id,
    session.device_id,
    session.signer_id,
    instanceId,
    nowMs(),
  ).run();
}
