import { sha256Hex } from '../../src/shared/hash';
import type { Env, ProductId, SessionState } from '../../src/types';

// 中文注释：会话只归关系数据库；产品、设备与签名绑定快照不会复制进 KV。
export async function storeSession(
  env: Env,
  sessionToken: string,
  session: SessionState,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO sessions
      (token_hash, tuyu_id, signer_id, key_revision, account_id, product_id,
        device_id, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).bind(
    await sha256Hex(sessionToken), session.tuyu_id, session.signer_id,
    session.key_revision, session.account_id, session.product_id, session.device_id,
    session.created_at, session.expires_at,
  ).run();
}

export async function readSession(
  env: Env,
  sessionToken: string,
  productId: ProductId,
): Promise<SessionState | null> {
  // 中文注释：一次读取同时检查会话和当前绑定；数据库失败不回退旧缓存。
  return env.DB.prepare(
    `SELECT s.tuyu_id, s.signer_id, s.key_revision, s.account_id, s.product_id,
       s.device_id, s.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.tuyu_id = s.tuyu_id AND u.user_state = 'active'
     JOIN signers k ON k.signer_id = s.signer_id AND k.tuyu_id = s.tuyu_id
       AND k.account_id = s.account_id AND k.key_revision = s.key_revision
       AND k.device_id = s.device_id AND k.signer_state = 'active' AND k.revoked_at IS NULL
     WHERE s.token_hash = ? AND s.product_id = ? AND s.expires_at > ?
       AND s.revoked_at IS NULL`,
  ).bind(await sha256Hex(sessionToken), productId, Date.now()).first<SessionState>();
}

export async function deleteSession(env: Env, sessionToken: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await sha256Hex(sessionToken)).run();
}

export async function cleanupExpiredSessions(env: Env, currentTime = Date.now()): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(currentTime).run();
}
