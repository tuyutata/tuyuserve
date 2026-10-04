import { verifyWalletSignature } from '../../account/cloud/signature';
import { ApiError, jsonResponse, readJson } from '../shared/api';
import { assertAccountId, assertMerchantInstanceId } from '../shared/ids';
import { assertSecurePublicUrl, requireMerchantSession, requireSession } from '../request_guard';
import type { CatalogListingRow, Env, ListingCapability } from '../types';
import {
  listListings,
  readListing,
  readListingByIdempotencyKey,
  readMerchantInstance,
  saveListing,
} from './repository';

interface PublishEnvelope {
  signed_payload?: unknown;
  signature?: unknown;
  idempotency_key?: unknown;
}

interface ListingPayload {
  listing_id: string;
  merchant_instance_id: string;
  capability: ListingCapability;
  title: string;
  summary: string;
  location: string;
  currency: string;
  minimum_amount: number;
  media_url: string | null;
  service_endpoint: string;
  source_updated_at: number;
  expires_at: number;
}

const CAPABILITIES = new Set<ListingCapability>(['hotel', 'restaurant', 'tour', 'ticket']);
const PAYLOAD_FIELDS = new Set([
  'listing_id', 'merchant_instance_id', 'capability', 'title', 'summary', 'location',
  'currency', 'minimum_amount', 'media_url', 'service_endpoint', 'source_updated_at', 'expires_at',
]);

function decodePayload(value: unknown): { bytes: Uint8Array; payload: ListingPayload } {
  if (typeof value !== 'string' || value.length < 16 || value.length > 16_384
      || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new ApiError(400, 'invalid_catalog_payload', '发现摘要编码无效');
  }
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== PAYLOAD_FIELDS.size || keys.some((key) => !PAYLOAD_FIELDS.has(key))) {
      throw new Error();
    }
    return { bytes, payload: record as unknown as ListingPayload };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'invalid_catalog_payload', '发现摘要内容无效');
  }
}

function validatePayload(payload: ListingPayload, listingId: string, merchantInstanceId: string): void {
  const now = Date.now();
  try {
    if (!/^tli_[0-9a-f]{32}$/u.test(payload.listing_id)
        || payload.listing_id !== listingId
        || assertMerchantInstanceId(payload.merchant_instance_id) !== merchantInstanceId
        || !CAPABILITIES.has(payload.capability)
        || typeof payload.title !== 'string' || payload.title.length < 1 || payload.title.length > 160
        || typeof payload.summary !== 'string' || payload.summary.length > 1_000
        || typeof payload.location !== 'string' || payload.location.length > 200
        || typeof payload.currency !== 'string' || !/^[A-Z]{3}$/u.test(payload.currency)
        || !Number.isSafeInteger(payload.minimum_amount) || payload.minimum_amount < 0
        || !Number.isSafeInteger(payload.source_updated_at)
        || !Number.isSafeInteger(payload.expires_at)
        || payload.source_updated_at > now + 300_000
        || payload.expires_at <= now
        || payload.expires_at > now + 30 * 24 * 60 * 60 * 1_000) {
      throw new Error();
    }
    assertSecurePublicUrl(payload.service_endpoint);
    if (payload.media_url !== null) assertSecurePublicUrl(payload.media_url);
  } catch {
    throw new ApiError(400, 'invalid_catalog_listing', '发现摘要字段无效');
  }
}

function responseListing(row: CatalogListingRow): Record<string, unknown> {
  return {
    listing_id: row.listing_id,
    merchant_instance_id: row.merchant_instance_id,
    capability: row.capability,
    title: row.title,
    summary: row.summary,
    location: row.location,
    currency: row.currency,
    minimum_amount: row.minimum_amount,
    media_url: row.media_url,
    service_endpoint: row.service_endpoint,
    installation_public_key: row.installation_public_key,
    source_updated_at: row.source_updated_at,
    expires_at: row.expires_at,
    signed_payload: row.signed_payload,
    signature: row.signature,
  };
}

export async function publishListing(
  request: Request,
  env: Env,
  listingId: string,
): Promise<Response> {
  await requireSession(request, env, 'tuyubooking');
  const envelope = await readJson<PublishEnvelope>(request);
  if (typeof envelope.signature !== 'string'
      || typeof envelope.idempotency_key !== 'string'
      || !/^[A-Za-z0-9._:-]{8,128}$/u.test(envelope.idempotency_key)) {
    throw new ApiError(400, 'invalid_catalog_publication', '发现摘要发布参数无效');
  }
  const repeated = await readListingByIdempotencyKey(env, envelope.idempotency_key);
  if (repeated) return jsonResponse({ ok: true, listing: responseListing(repeated) });
  const { bytes, payload } = decodePayload(envelope.signed_payload);
  const merchantInstanceId = payload.merchant_instance_id;
  validatePayload(payload, listingId, merchantInstanceId);
  await requireMerchantSession(request, env, merchantInstanceId);
  const merchant = await readMerchantInstance(env, merchantInstanceId);
  if (!merchant || merchant.status !== 'active') {
    throw new ApiError(403, 'merchant_instance_unavailable', '商家端实例不可用');
  }
  const installationPublicKey = assertAccountId(merchant.installation_public_key);
  if (!await verifyWalletSignature(bytes, envelope.signature, installationPublicKey)) {
    throw new ApiError(401, 'invalid_catalog_signature', '发现摘要实例签名无效');
  }
  const row: CatalogListingRow = {
    ...payload,
    installation_public_key: installationPublicKey,
    signed_payload: envelope.signed_payload as string,
    signature: envelope.signature,
    publication_idempotency_key: envelope.idempotency_key,
    status: 'active',
    published_at: Date.now(),
  };
  try {
    await saveListing(env, row);
  } catch {
    throw new ApiError(409, 'catalog_listing_not_newer', '发现摘要不是更新版本');
  }
  return jsonResponse({ ok: true, listing: responseListing(row) }, 201);
}

export async function discoverListings(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawCapability = url.searchParams.get('capability');
  const capability = rawCapability === null ? null : rawCapability as ListingCapability;
  if (capability !== null && !CAPABILITIES.has(capability)) {
    throw new ApiError(400, 'invalid_catalog_capability', '发现分类无效');
  }
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length > 100) throw new ApiError(400, 'invalid_catalog_query', '搜索内容过长');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '30'), 50);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new ApiError(400, 'invalid_catalog_limit', '分页数量无效');
  }
  const listings = await listListings(env, capability, query, limit);
  return jsonResponse({ ok: true, listings: listings.map(responseListing) });
}

export async function catalogListing(env: Env, listingId: string): Promise<Response> {
  if (!/^tli_[0-9a-f]{32}$/u.test(listingId)) {
    throw new ApiError(400, 'invalid_listing_id', '发现记录标识无效');
  }
  const listing = await readListing(env, listingId);
  if (!listing) throw new ApiError(404, 'catalog_listing_not_found', '发现记录不存在');
  return jsonResponse({ ok: true, listing: responseListing(listing) });
}
