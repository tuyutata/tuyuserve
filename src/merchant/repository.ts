import type { Env, MerchantInstanceRow, MerchantRole } from '../types';

export async function readMerchantInstance(
  env: Env,
  instanceId: string,
): Promise<MerchantInstanceRow | null> {
  return env.DB.prepare(
    `SELECT instance_id, owner_id, instance_key,
      instance_name, merchant_type, service_endpoint, instance_state, registered_at, updated_at
      FROM instances WHERE instance_id = ?`,
  ).bind(instanceId).first<MerchantInstanceRow>();
}

export async function readMerchantRole(
  env: Env,
  instanceId: string,
  tuyuId: string,
): Promise<MerchantRole | null> {
  const instance = await readMerchantInstance(env, instanceId);
  if (!instance || instance.instance_state !== 'active') return null;
  if (instance.owner_id === tuyuId) return 'MERCHANT_OWNER';
  const grant = await env.DB.prepare(
    `SELECT admin_id FROM grants
      WHERE instance_id = ? AND admin_id = ? AND grant_state = 'active'`,
  ).bind(instanceId, tuyuId).first<{ admin_id: string }>();
  return grant ? 'MERCHANT_ADMIN' : null;
}
