import type { Env, MerchantInstanceRow, MerchantRole } from '../types';

export async function readMerchantInstance(
  env: Env,
  merchantInstanceId: string,
): Promise<MerchantInstanceRow | null> {
  return env.DB.prepare(
    `SELECT merchant_instance_id, merchant_tuyu_id, installation_public_key,
      installation_name, merchant_type, service_endpoint, status, registered_at, updated_at
      FROM merchant_instances WHERE merchant_instance_id = ?`,
  ).bind(merchantInstanceId).first<MerchantInstanceRow>();
}

export async function readMerchantRole(
  env: Env,
  merchantInstanceId: string,
  tuyuId: string,
): Promise<MerchantRole | null> {
  const instance = await readMerchantInstance(env, merchantInstanceId);
  if (!instance || instance.status !== 'active') return null;
  if (instance.merchant_tuyu_id === tuyuId) return 'MERCHANT_OWNER';
  const grant = await env.DB.prepare(
    `SELECT role FROM merchant_instance_grants
      WHERE merchant_instance_id = ? AND administrator_tuyu_id = ? AND status = 'active'`,
  ).bind(merchantInstanceId, tuyuId).first<{ role: 'MERCHANT_ADMIN' }>();
  return grant?.role ?? null;
}
