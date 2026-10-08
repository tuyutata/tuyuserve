import { describe, expect, it } from 'vitest';
import { storeSession } from '../account/cloud/session';
import { createTrip, publicTrips } from '../src/social/service';
import type { SessionState } from '../src/types';
import { createTestEnv, request, responseJson } from './support';

function session(tuyuId: string): SessionState {
  return {
    tuyu_id: tuyuId,
    signer_id: `tys_${tuyuId}`,
    key_revision: 1,
    account_id: `0x${'1'.repeat(64)}`,
    audience: 'tuyulove',
    device_id: `device-${tuyuId}`,
    created_at: Date.now(),
    expires_at: Date.now() + 60_000,
  };
}

describe('途遇游记', () => {
  it('游记写入可幂等重试且公开列表不包含会话令牌', async () => {
    const value = createTestEnv();
    await storeSession(value.env, 'traveler-token', session('TUYU-TRAVELER'), 60);
    const body = {
      title: '海边的一天', content: '日落之前抵达。', media_keys: [],
      idempotency_key: 'trip-create-0001',
    };
    const first = await createTrip(request('/v1/trips', body, 'traveler-token'), value.env);
    const second = await createTrip(request('/v1/trips', body, 'traveler-token'), value.env);
    expect(first.status).toBe(201);
    expect((await responseJson(first)).trip).toEqual((await responseJson(second)).trip);
    const listed = await responseJson(await publicTrips(
      new Request('https://worker.test/v1/trips'), value.env,
    ));
    expect(JSON.stringify(listed)).not.toContain('traveler-token');
    expect(listed.trips).toHaveLength(1);
  });
});
