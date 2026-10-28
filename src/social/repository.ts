import type { Env, TripPostRow } from '../types';

export async function readTripByIdempotency(
  env: Env,
  authorId: string,
  requestKey: string,
): Promise<TripPostRow | null> {
  return env.DB.prepare(
    `SELECT * FROM posts WHERE author_id = ? AND request_key = ?`,
  ).bind(authorId, requestKey).first<TripPostRow>();
}

export async function insertTrip(env: Env, row: TripPostRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO posts
      (trip_id, author_id, post_title, post_body, media_keys, request_key,
       post_state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
  ).bind(
    row.trip_id,
    row.author_id,
    row.post_title,
    row.post_body,
    row.media_keys,
    row.request_key,
    row.created_at,
    row.updated_at,
  ).run();
}

export async function listPublicTrips(env: Env, limit: number): Promise<TripPostRow[]> {
  return (await env.DB.prepare(
    `SELECT * FROM posts WHERE post_state = 'published'
      ORDER BY created_at DESC, trip_id ASC LIMIT ?`,
  ).bind(limit).all<TripPostRow>()).results;
}
