import type { Env, TuyuSignerRow, UserRow } from '../../src/types';

export async function readUserByTuyuId(env: Env, tuyuId: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT tuyu_id, status, created_at, updated_at
      FROM users WHERE tuyu_id = ?`,
  ).bind(tuyuId).first<UserRow>();
}

export async function readSignerByAccountId(env: Env, accountId: string): Promise<TuyuSignerRow | null> {
  return env.DB.prepare(
    `SELECT signer_id, tuyu_id, account_id, key_revision, device_id, status,
      bound_at, revoked_at, updated_at FROM tuyu_signers WHERE account_id = ?`,
  ).bind(accountId).first<TuyuSignerRow>();
}

export async function readActiveSigner(
  env: Env,
  tuyuId: string,
  accountId: string,
): Promise<TuyuSignerRow | null> {
  return env.DB.prepare(
    `SELECT signer_id, tuyu_id, account_id, key_revision, device_id, status,
      bound_at, revoked_at, updated_at FROM tuyu_signers
      WHERE tuyu_id = ? AND account_id = ? AND status = 'active'`,
  ).bind(tuyuId, accountId).first<TuyuSignerRow>();
}
