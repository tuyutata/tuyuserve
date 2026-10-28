import { cryptoWaitReady, sr25519PairFromSeed, sr25519Sign } from '@polkadot/util-crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLoginChallenge, createSession, logout } from '../account/cloud/service';
import { requireMerchantSession, requireSession } from '../src/request_guard';
import { hexToBytes, OP_SIGN_TUYU_LOGIN, signingMessage } from '../src/shared/signing_message';
import type { MerchantInstanceRow, TuyuSignerRow, UserRow } from '../src/types';
import { createTestEnv, request, responseJson } from './support';

const toHex = (value: Uint8Array) => `0x${[...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;

describe('TuyuServe多sr25519账户登录', () => {
  beforeAll(async () => { expect(await cryptoWaitReady()).toBe(true) });

  async function setup(seedByte = 7, withMerchant = false) {
    const pair = sr25519PairFromSeed(new Uint8Array(32).fill(seedByte));
    const fixture = createTestEnv();
    const user: UserRow = { tuyu_id: 'TUYU-100086', user_state: 'active', created_at: 1, updated_at: 1 };
    const signer: TuyuSignerRow = {
      signer_id: `tys_${seedByte}`, tuyu_id: user.tuyu_id, account_id: toHex(pair.publicKey),
      key_revision: 1, device_id: `device-${seedByte}`, signer_state: 'active',
      bound_at: 1, revoked_at: null, updated_at: 1,
    };
    fixture.db.users.set(user.tuyu_id, user); fixture.db.signers.set(signer.signer_id, signer);
    const merchant: MerchantInstanceRow | null = withMerchant ? {
      instance_id: `tmi_${'1'.repeat(32)}`, owner_id: user.tuyu_id,
      instance_key: `0x${'3'.repeat(64)}`, instance_name: 'A酒店',
      merchant_type: 'hotel', service_endpoint: 'https://hotel.example', instance_state: 'active',
      registered_at: 1, updated_at: 1,
    } : null;
    if (merchant) fixture.db.merchantInstances.set(merchant.instance_id, merchant);
    return { ...fixture, pair, user, signer, merchant };
  }

  async function issue(seed = 7, productId: 'tuyulove' | 'tuyuserve' | 'tuyubooking' = 'tuyulove') {
    const fixture = await setup(seed, productId === 'tuyubooking');
    const challenge = await responseJson(await createLoginChallenge(request('/v1/auth/challenge', {
      tuyu_id: fixture.user.tuyu_id, account_id: fixture.signer.account_id, product_id: productId,
      device_id: fixture.signer.device_id,
    }), fixture.env));
    const signature = toHex(sr25519Sign(
      signingMessage(OP_SIGN_TUYU_LOGIN, hexToBytes(challenge.signing_payload_hex as string)),
      fixture.pair,
    ));
    const response = await createSession(request('/v1/auth/session', {
      tuyu_id: fixture.user.tuyu_id, challenge_id: challenge.challenge_id, signature,
    }), fixture.env);
    return { ...fixture, challenge, signature, response };
  }

  it('同一途遇号的不同签名账户分别登录', async () => {
    const first = await issue(7); const second = await issue(8);
    expect((await responseJson(first.response)).signer_id).toBe('tys_7');
    expect((await responseJson(second.response)).signer_id).toBe('tys_8');
  });

  it('原子消费挑战并拒绝重放', async () => {
    const result = await issue(7, 'tuyuserve');
    await expect(createSession(request('/v1/auth/session', {
      tuyu_id: result.user.tuyu_id, challenge_id: result.challenge.challenge_id,
      signature: result.signature,
    }), result.env)).rejects.toMatchObject({ code: 'used_challenge' });
  });

  it('停用一个签名账户不影响其他账户', async () => {
    const revoked = await setup(7); revoked.signer.signer_state = 'revoked'; revoked.signer.revoked_at = 2;
    await expect(createLoginChallenge(request('/v1/auth/challenge', {
      tuyu_id: revoked.user.tuyu_id, account_id: revoked.signer.account_id,
      product_id: 'tuyulove', device_id: revoked.signer.device_id,
    }), revoked.env)).rejects.toMatchObject({ code: 'identity_unavailable' });
    expect((await issue(8)).response.status).toBe(200);
  });

  it('账户会话只绑定产品，商家权限由商家模块实时读取', async () => {
    const result = await issue(7, 'tuyubooking');
    const session = await responseJson(result.response);
    expect(session).not.toHaveProperty('instance_id');
    expect(session).not.toHaveProperty('merchant_role');
    const protectedRequest = new Request('https://worker.test/private', {
      headers: { authorization: `Bearer ${session.session_token as string}` },
    });
    await expect(requireSession(protectedRequest, result.env, 'tuyulove'))
      .rejects.toMatchObject({ code: 'invalid_session' });
    await expect(requireMerchantSession(
      protectedRequest,
      result.env,
      result.merchant!.instance_id,
    )).resolves.toMatchObject({ tuyu_id: result.user.tuyu_id });
    await expect(requireMerchantSession(
      protectedRequest,
      result.env,
      `tmi_${'2'.repeat(32)}`,
    )).rejects.toMatchObject({ code: 'merchant_access_denied' });
  });

  it('拒绝过期挑战', async () => {
    const fixture = await setup(7);
    const challenge = await responseJson(await createLoginChallenge(request('/v1/auth/challenge', {
      tuyu_id: fixture.user.tuyu_id, account_id: fixture.signer.account_id,
      product_id: 'tuyulove', device_id: fixture.signer.device_id,
    }), fixture.env));
    fixture.db.challenges.get(challenge.challenge_id as string)!.expires_at = 0;
    await expect(createSession(request('/v1/auth/session', {
      tuyu_id: fixture.user.tuyu_id, challenge_id: challenge.challenge_id,
      signature: `0x${'0'.repeat(128)}`,
    }), fixture.env)).rejects.toMatchObject({ code: 'expired_challenge' });
  });

  it('商家授权变化无需覆盖账户会话即可立即生效', async () => {
    const result = await issue(7, 'tuyubooking');
    const session = await responseJson(result.response);
    const protectedRequest = new Request('https://worker.test/private', {
      headers: { authorization: `Bearer ${session.session_token as string}` },
    });
    result.merchant!.owner_id = 'TUYU-OTHER';
    await expect(requireMerchantSession(
      protectedRequest,
      result.env,
      result.merchant!.instance_id,
    )).rejects.toMatchObject({ code: 'merchant_access_denied' });
  });

  it('挑战只保留claims，会话不写KV，注销立即失效', async () => {
    const result = await issue();
    expect([...result.db.challenges.values()][0]).not.toHaveProperty('signing_payload');
    expect(result.kv.values.size).toBe(0);
    const session = await responseJson(result.response);
    const request = new Request('https://worker.test/private', {
      headers: { authorization: `Bearer ${session.session_token as string}` },
    });
    await expect(requireSession(request, result.env, 'tuyulove')).resolves.toMatchObject({
      signer_id: result.signer.signer_id, product_id: 'tuyulove',
    });
    await logout(request, result.env);
    await expect(requireSession(request, result.env, 'tuyulove'))
      .rejects.toMatchObject({ code: 'invalid_session' });
    expect(result.kv.values.size).toBe(0);
  });

  it.each(['expiry', 'revocation', 'user', 'signer', 'revision', 'account', 'device'])(
    '会话读取实时拒绝%s变化', async (change) => {
      const result = await issue();
      const session = await responseJson(result.response);
      const row = [...result.db.sessions.values()][0];
      if (change === 'expiry') row.expires_at = 0;
      if (change === 'revocation') row.revoked_at = Date.now();
      if (change === 'user') result.user.user_state = 'frozen';
      if (change === 'signer') result.signer.signer_state = 'revoked';
      if (change === 'revision') result.signer.key_revision += 1;
      if (change === 'account') result.signer.account_id = `0x${'0'.repeat(64)}`;
      if (change === 'device') result.signer.device_id = 'another-device';
      await expect(requireSession(new Request('https://worker.test/private', {
        headers: { authorization: `Bearer ${session.session_token as string}` },
      }), result.env, 'tuyulove')).rejects.toMatchObject({ code: 'invalid_session' });
    },
  );

  it('数据库读取失败不会回退会话缓存', async () => {
    const result = await issue();
    const session = await responseJson(result.response);
    result.db.failReads = true;
    await expect(requireSession(new Request('https://worker.test/private', {
      headers: { authorization: `Bearer ${session.session_token as string}` },
    }), result.env, 'tuyulove')).rejects.toThrow('fixture_database_unavailable');
    expect(result.kv.values.size).toBe(0);
  });

  it('并发签名响应只消费一次，写会话失败也不留下缓存认证', async () => {
    const fixture = await setup();
    const challenge = await responseJson(await createLoginChallenge(request('/v1/auth/challenge', {
      tuyu_id: fixture.user.tuyu_id, account_id: fixture.signer.account_id,
      product_id: 'tuyulove', device_id: fixture.signer.device_id,
    }), fixture.env));
    const signature = toHex(sr25519Sign(
      signingMessage(OP_SIGN_TUYU_LOGIN, hexToBytes(challenge.signing_payload_hex as string)),
      fixture.pair,
    ));
    const body = { tuyu_id: fixture.user.tuyu_id, challenge_id: challenge.challenge_id, signature };
    const results = await Promise.allSettled([0, 1].map(() =>
      createSession(request('/v1/auth/session', body), fixture.env)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(fixture.db.sessions.size).toBe(1);
    expect(fixture.kv.values.size).toBe(0);

    const failure = await setup(8);
    const next = await responseJson(await createLoginChallenge(request('/v1/auth/challenge', {
      tuyu_id: failure.user.tuyu_id, account_id: failure.signer.account_id,
      product_id: 'tuyulove', device_id: failure.signer.device_id,
    }), failure.env));
    failure.db.failSessionWrites = true;
    await expect(createSession(request('/v1/auth/session', {
      tuyu_id: failure.user.tuyu_id, challenge_id: next.challenge_id,
      signature: toHex(sr25519Sign(
        signingMessage(OP_SIGN_TUYU_LOGIN, hexToBytes(next.signing_payload_hex as string)), failure.pair,
      )),
    }), failure.env)).rejects.toThrow('fixture_session_write_failed');
    expect(failure.db.sessions.size).toBe(0);
    expect(failure.kv.values.size).toBe(0);
  });

});
