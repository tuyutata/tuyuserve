import type { Env, TuyuSignerRow, UserRow } from '../../src/types';

export async function readUserByTuyuId(env: Env, tuyuId: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT tuyu_id, user_state, created_at, updated_at
      FROM users WHERE tuyu_id = ?`,
  ).bind(tuyuId).first<UserRow>();
}

export async function readSignerByAccountId(env: Env, accountId: string): Promise<TuyuSignerRow | null> {
  return env.DB.prepare(
    `SELECT signer_id, tuyu_id, account_id, key_revision, device_id, signer_state,
      bound_at, revoked_at, updated_at FROM signers WHERE account_id = ?`,
  ).bind(accountId).first<TuyuSignerRow>();
}

export async function readActiveSigner(
  env: Env,
  tuyuId: string,
  accountId: string,
): Promise<TuyuSignerRow | null> {
  return env.DB.prepare(
    `SELECT signer_id, tuyu_id, account_id, key_revision, device_id, signer_state,
      bound_at, revoked_at, updated_at FROM signers
      WHERE tuyu_id = ? AND account_id = ? AND signer_state = 'active'`,
  ).bind(tuyuId, accountId).first<TuyuSignerRow>();
}
