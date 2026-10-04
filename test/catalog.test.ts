import { cryptoWaitReady, sr25519PairFromSeed, sr25519Sign } from '@polkadot/util-crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { storeSession } from '../account/cloud/session';
import { catalogListing, discoverListings, publishListing } from '../src/catalog/service';
import type { MerchantInstanceRow, SessionState } from '../src/types';
import { createTestEnv, responseJson } from './support';

const hex = (value: Uint8Array) => `0x${[...value]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
const base64Url = (value: Uint8Array) => btoa(String.fromCharCode(...value))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

describe('签名旅行发现索引', () => {
  beforeAll(async () => { expect(await cryptoWaitReady()).toBe(true) });

  async function fixture() {
    const value = createTestEnv();
    const pair = sr25519PairFromSeed(new Uint8Array(32).fill(19));
    const merchantInstanceId = `tmi_${'1'.repeat(32)}`;
    const merchant: MerchantInstanceRow = {
      merchant_instance_id: merchantInstanceId,
      merchant_tuyu_id: 'TUYU-MERCHANT',
      installation_public_key: hex(pair.publicKey),
      installation_name: '途遇测试酒店',
      merchant_type: 'hotel',
      service_endpoint: 'https://hotel.example',
      status: 'active',
      registered_at: 1,
      updated_at: 1,
    };
    value.db.merchantInstances.set(merchantInstanceId, merchant);
    const session: SessionState = {
      tuyu_id: merchant.merchant_tuyu_id,
      signer_id: 'tys_merchant',
      key_revision: 1,
      account_id: `0x${'2'.repeat(64)}`,
      audience: 'tuyubooking',
      device_id: 'merchant-device',
      created_at: Date.now(),
      expires_at: Date.now() + 60_000,
    };
    await storeSession(value.env, 'merchant-token', session, 60);
    return { ...value, pair, merchantInstanceId };
  }

  it('验签后发布并公开返回原始签名证据', async () => {
    const value = await fixture();
    const listingId = `tli_${'3'.repeat(32)}`;
    const payload = new TextEncoder().encode(JSON.stringify({
      listing_id: listingId,
      merchant_instance_id: value.merchantInstanceId,
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
        signature,
        idempotency_key: 'catalog-publication-1',
      }),
    });
    const published = await publishListing(request, value.env, listingId);
    expect(published.status).toBe(201);
    const found = await responseJson(await discoverListings(
      new Request('https://worker.test/v1/catalog?capability=hotel&q=%E5%B1%B1%E6%B5%B7'),
      value.env,
    ));
    const listings = found.listings as Array<Record<string, unknown>>;
    expect(listings).toHaveLength(1);
    expect(listings[0].signed_payload).toBe(signedPayload);
    expect(listings[0].signature).toBe(signature);
    expect((await responseJson(await catalogListing(value.env, listingId))).listing)
      .toMatchObject({ listing_id: listingId, service_endpoint: 'https://hotel.example/tuyu' });
  });

  it('拒绝被修改或伪造的商家摘要', async () => {
    const value = await fixture();
    const listingId = `tli_${'4'.repeat(32)}`;
    const payload = new TextEncoder().encode(JSON.stringify({
      listing_id: listingId,
      merchant_instance_id: value.merchantInstanceId,
      capability: 'hotel', title: '测试', summary: '', location: '', currency: 'CNY',
      minimum_amount: 1, media_url: null, service_endpoint: 'https://hotel.example',
      source_updated_at: Date.now(), expires_at: Date.now() + 60_000,
    }));
    const request = new Request(`https://worker.test/v1/catalog/${listingId}`, {
      method: 'PUT',
      headers: { authorization: 'Bearer merchant-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        signed_payload: base64Url(payload),
        signature: `0x${'0'.repeat(128)}`,
        idempotency_key: 'catalog-publication-2',
      }),
    });
    await expect(publishListing(request, value.env, listingId))
      .rejects.toMatchObject({ code: 'invalid_catalog_signature' });
  });
});
