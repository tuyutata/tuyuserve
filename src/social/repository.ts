import type { Env, TripPostRow } from '../types';

export async function readTripByIdempotency(
  env: Env,
  authorTuyuId: string,
  idempotencyKey: string,
): Promise<TripPostRow | null> {
  return env.DB.prepare(
    `SELECT * FROM trip_posts WHERE author_tuyu_id = ? AND idempotency_key = ?`,
  ).bind(authorTuyuId, idempotencyKey).first<TripPostRow>();
}

export async function insertTrip(env: Env, row: TripPostRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO trip_posts
      (trip_id, author_tuyu_id, title, content, media_keys_json, idempotency_key,
       status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
  ).bind(
    row.trip_id,
    row.author_tuyu_id,
    row.title,
    row.content,
    row.media_keys_json,
    row.idempotency_key,
    row.created_at,
    row.updated_at,
  ).run();
}

export async function listPublicTrips(env: Env, limit: number): Promise<TripPostRow[]> {
  return (await env.DB.prepare(
    `SELECT * FROM trip_posts WHERE status = 'published'
      ORDER BY created_at DESC, trip_id ASC LIMIT ?`,
  ).bind(limit).all<TripPostRow>()).results;
}
