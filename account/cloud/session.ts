import { sha256Hex } from '../../src/shared/hash';
import type { Env, SessionState } from '../../src/types';

export async function storeSession(
  env: Env,
  sessionToken: string,
  session: SessionState,
  ttlSeconds: number,
): Promise<void> {
  const tokenHash = await sha256Hex(sessionToken);
  const cacheKey = `tuyu_session:${tokenHash}`;
  await env.SESSION_CACHE.put(cacheKey, JSON.stringify(session), { expirationTtl: ttlSeconds });
  try {
    await env.DB.prepare(
      `INSERT INTO sessions
        (session_token_hash, tuyu_id, signer_id, key_revision, account_id, audience,
          device_id, created_at, expires_at, revoked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).bind(
      tokenHash,
      session.tuyu_id,
      session.signer_id,
      session.key_revision,
      session.account_id,
      session.audience,
      session.device_id,
      session.created_at,
      session.expires_at,
    ).run();
  } catch (error) {
    await env.SESSION_CACHE.delete(cacheKey);
    throw error;
  }
}

export async function deleteSession(env: Env, sessionToken: string): Promise<void> {
  const tokenHash = await sha256Hex(sessionToken);
  await Promise.all([
    env.SESSION_CACHE.delete(`tuyu_session:${tokenHash}`),
    env.DB.prepare('DELETE FROM sessions WHERE session_token_hash = ?').bind(tokenHash).run(),
  ]);
}

export async function cleanupExpiredSessionIndexes(env: Env, currentTime = Date.now()): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(currentTime).run();
}
