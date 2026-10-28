import { cryptoWaitReady, sr25519PairFromSeed, sr25519Sign } from '@polkadot/util-crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { storeSession } from '../account/cloud/session';
import { catalogListing, discoverListings, publishListing } from '../src/catalog/service';
import type { MerchantInstanceRow, SessionState } from '../src/types';
import { createTestEnv, seedIdentity, responseJson } from './support';

const hex = (value: Uint8Array) => `0x${[...value]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
const base64Url = (value: Uint8Array) => btoa(String.fromCharCode(...value))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

describe('签名旅行发现索引', () => {
  beforeAll(async () => { expect(await cryptoWaitReady()).toBe(true) });

  async function fixture() {
    const value = createTestEnv();
    const pair = sr25519PairFromSeed(new Uint8Array(32).fill(19));
    const instanceId = `tmi_${'1'.repeat(32)}`;
    const merchant: MerchantInstanceRow = {
      instance_id: instanceId,
      owner_id: 'TUYU-MERCHANT',
      instance_key: hex(pair.publicKey),
      instance_name: '途遇测试酒店',
      merchant_type: 'hotel',
      service_endpoint: 'https://hotel.example',
      instance_state: 'active',
      registered_at: 1,
      updated_at: 1,
    };
    value.db.merchantInstances.set(instanceId, merchant);
    const session: SessionState = {
      tuyu_id: merchant.owner_id,
      signer_id: 'tys_merchant',
      key_revision: 1,
      account_id: `0x${'2'.repeat(64)}`,
      product_id: 'tuyubooking',
      device_id: 'merchant-device',
      created_at: Date.now(),
      expires_at: Date.now() + 60_000,
    };
    seedIdentity(value.db, session);
    await storeSession(value.env, 'merchant-token', session);
    return { ...value, pair, instanceId };
  }

  it('验签后发布并公开返回原始签名证据', async () => {
    const value = await fixture();
    const listingId = `tli_${'3'.repeat(32)}`;
    const payload = new TextEncoder().encode(JSON.stringify({
      listing_id: listingId,
      merchant_instance_id: value.instanceId,
      capability: 'hotel',
      title: '山海酒店',
      summary: '临海客房',
      location: '青岛',
      currency: 'CNY',
      minimum_amount: 68800,
      media_url: 'https://media.example/hotel.jpg',
      service_endpoint: 'https://hotel.example/tuyu',
      source_updated_at: Date.now(),
      expires_at: Date.now() + 86_400_000,
    }));
    const signedPayload = base64Url(payload);
    const signature = hex(sr25519Sign(payload, value.pair));
    const request = new Request(`https://worker.test/v1/catalog/${listingId}`, {
      method: 'PUT',
      headers: { authorization: 'Bearer merchant-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        signed_payload: signedPayload,
        payload_signature: signature,
        request_key: 'catalog-publication-1',
      }),
    });
    const published = await publishListing(request, value.env, listingId);
    expect(published.status).toBe(201);
    const found = await responseJson(await discoverListings(
      new Request('https://worker.test/v1/catalog?service_kind=hotel&q=%E5%B1%B1%E6%B5%B7'),
      value.env,
    ));
    const listings = found.listings as Array<Record<string, unknown>>;
    expect(listings).toHaveLength(1);
    expect(listings[0].signed_payload).toBe(signedPayload);
    expect(listings[0].payload_signature).toBe(signature);
    expect((await responseJson(await catalogListing(value.env, listingId))).listing)
      .toMatchObject({ listing_id: listingId, service_endpoint: 'https://hotel.example/tuyu' });
  });

  it('拒绝被修改或伪造的商家摘要', async () => {
    const value = await fixture();
    const listingId = `tli_${'4'.repeat(32)}`;
    const payload = new TextEncoder().encode(JSON.stringify({
      listing_id: listingId,
      merchant_instance_id: value.instanceId,
      capability: 'hotel', title: '测试', summary: '', location: '', currency: 'CNY',
      minimum_amount: 1, media_url: null, service_endpoint: 'https://hotel.example',
      source_updated_at: Date.now(), expires_at: Date.now() + 60_000,
    }));
    const request = new Request(`https://worker.test/v1/catalog/${listingId}`, {
      method: 'PUT',
      headers: { authorization: 'Bearer merchant-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        signed_payload: base64Url(payload),
        payload_signature: `0x${'0'.repeat(128)}`,
        request_key: 'catalog-publication-2',
      }),
    });
    await expect(publishListing(request, value.env, listingId))
      .rejects.toMatchObject({ code: 'invalid_catalog_signature' });
  });

  it('详情由原签名恢复，乱序发布只保留更新版本', async () => {
    const value = await fixture();
    const listingId = `tli_${'8'.repeat(32)}`;
    const now = Date.now();
    const publish = async (sourceTime: number, requestKey: string) => {
      const bytes = new TextEncoder().encode(JSON.stringify({
        listing_id: listingId, merchant_instance_id: value.instanceId,
        capability: 'hotel', title: '签名详情', summary: '无需重复列', location: '青岛',
        currency: 'CNY', minimum_amount: 12345, media_url: 'https://media.example/original',
        service_endpoint: 'https://hotel.example/original', source_updated_at: sourceTime,
        expires_at: now + 60_000,
      }));
      return publishListing(new Request(`https://worker.test/v1/catalog/${listingId}`, {
        method: 'PUT', headers: { authorization: 'Bearer merchant-token' },
        body: JSON.stringify({ signed_payload: base64Url(bytes),
          payload_signature: hex(sr25519Sign(bytes, value.pair)), request_key: requestKey }),
      }), value.env, listingId);
    };
    await publish(now, 'catalog-detail-1');
    const results = await Promise.allSettled([
      publish(now + 1, 'catalog-detail-2'), publish(now - 1, 'catalog-detail-3'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const row = value.db.catalogListings.get(listingId)!;
    for (const field of ['currency', 'minimum_amount', 'media_url', 'service_endpoint']) {
      expect(row).not.toHaveProperty(field);
    }
    expect(row.source_time).toBe(now + 1);
    const result = await responseJson(await catalogListing(value.env, listingId));
    expect(result.listing).toMatchObject({ currency: 'CNY', minimum_amount: 12345,
      media_url: 'https://media.example/original', service_endpoint: 'https://hotel.example/original',
      source_time: now + 1, signed_payload: row.signed_payload,
      payload_signature: row.payload_signature });
  });

});
