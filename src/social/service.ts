import { ApiError, jsonResponse, readJson } from '../shared/api';
import { createId } from '../shared/ids';
import { requireSession } from '../request_guard';
import type { Env, TripPostRow } from '../types';
import { insertTrip, listPublicTrips, readTripByIdempotency } from './repository';

interface CreateTripRequest {
  title?: unknown;
  content?: unknown;
  media_keys?: unknown;
  idempotency_key?: unknown;
}

function responseTrip(row: TripPostRow): Record<string, unknown> {
  return {
    trip_id: row.trip_id,
    author_tuyu_id: row.author_tuyu_id,
    title: row.title,
    content: row.content,
    media_keys: JSON.parse(row.media_keys_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createTrip(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env, 'tuyulove');
  const body = await readJson<CreateTripRequest>(request);
  if (typeof body.title !== 'string' || body.title.trim().length < 1
      || body.title.length > 120 || typeof body.content !== 'string'
      || body.content.trim().length < 1 || body.content.length > 20_000
      || typeof body.idempotency_key !== 'string'
      || !/^[A-Za-z0-9._:-]{8,128}$/u.test(body.idempotency_key)
      || !Array.isArray(body.media_keys) || body.media_keys.length > 12
      || body.media_keys.some((item) => typeof item !== 'string'
        || !/^trip\/[A-Za-z0-9/_-]{1,240}$/u.test(item))) {
    throw new ApiError(400, 'invalid_trip_post', '游记内容无效');
  }
  const repeated = await readTripByIdempotency(env, session.tuyu_id, body.idempotency_key);
  if (repeated) return jsonResponse({ ok: true, trip: responseTrip(repeated) });
  const timestamp = Date.now();
  const row: TripPostRow = {
    trip_id: createId('ttr'),
    author_tuyu_id: session.tuyu_id,
    title: body.title.trim(),
    content: body.content.trim(),
    media_keys_json: JSON.stringify(body.media_keys),
    idempotency_key: body.idempotency_key,
    status: 'published',
    created_at: timestamp,
    updated_at: timestamp,
  };
  await insertTrip(env, row);
  return jsonResponse({ ok: true, trip: responseTrip(row) }, 201);
}

export async function publicTrips(request: Request, env: Env): Promise<Response> {
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') ?? '30'), 50);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new ApiError(400, 'invalid_trip_limit', '游记分页数量无效');
  }
  const trips = await listPublicTrips(env, limit);
  return jsonResponse({ ok: true, trips: trips.map(responseTrip) });
}
