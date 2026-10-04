import type { CatalogListingRow, Env, ListingCapability, MerchantInstanceRow } from '../types';

export async function readMerchantInstance(
  env: Env,
  merchantInstanceId: string,
): Promise<MerchantInstanceRow | null> {
  return env.DB.prepare(
    `SELECT merchant_instance_id, merchant_tuyu_id, installation_public_key,
      installation_name, merchant_type, service_endpoint, status, registered_at, updated_at
      FROM merchant_instances WHERE merchant_instance_id = ?`,
  ).bind(merchantInstanceId).first<MerchantInstanceRow>();
}

export async function readListingByIdempotencyKey(
  env: Env,
  idempotencyKey: string,
): Promise<CatalogListingRow | null> {
  return env.DB.prepare(
    `SELECT * FROM catalog_listings WHERE publication_idempotency_key = ?`,
  ).bind(idempotencyKey).first<CatalogListingRow>();
}

export async function readListing(
  env: Env,
  listingId: string,
): Promise<CatalogListingRow | null> {
  return env.DB.prepare(
    `SELECT * FROM catalog_listings WHERE listing_id = ? AND status = 'active' AND expires_at > ?`,
  ).bind(listingId, Date.now()).first<CatalogListingRow>();
}

export async function listListings(
  env: Env,
  capability: ListingCapability | null,
  query: string,
  limit: number,
): Promise<CatalogListingRow[]> {
  const pattern = `%${query}%`;
  const statement = capability
    ? env.DB.prepare(
      `SELECT * FROM catalog_listings
        WHERE status = 'active' AND expires_at > ? AND capability = ?
          AND (? = '' OR LOWER(title) LIKE LOWER(?) OR LOWER(summary) LIKE LOWER(?)
            OR LOWER(location) LIKE LOWER(?))
        ORDER BY source_updated_at DESC, listing_id ASC LIMIT ?`,
    ).bind(Date.now(), capability, query, pattern, pattern, pattern, limit)
    : env.DB.prepare(
      `SELECT * FROM catalog_listings
        WHERE status = 'active' AND expires_at > ?
          AND (? = '' OR LOWER(title) LIKE LOWER(?) OR LOWER(summary) LIKE LOWER(?)
            OR LOWER(location) LIKE LOWER(?))
        ORDER BY source_updated_at DESC, listing_id ASC LIMIT ?`,
    ).bind(Date.now(), query, pattern, pattern, pattern, limit);
  return (await statement.all<CatalogListingRow>()).results;
}

export async function saveListing(env: Env, row: CatalogListingRow): Promise<void> {
  const result = await env.DB.prepare(
    `INSERT INTO catalog_listings
      (listing_id, merchant_instance_id, capability, title, summary, location, currency,
       minimum_amount, media_url, service_endpoint, installation_public_key,
       source_updated_at, expires_at, signed_payload, signature,
       publication_idempotency_key, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT(listing_id) DO UPDATE SET
        merchant_instance_id=excluded.merchant_instance_id,
        capability=excluded.capability, title=excluded.title, summary=excluded.summary,
        location=excluded.location, currency=excluded.currency,
        minimum_amount=excluded.minimum_amount, media_url=excluded.media_url,
        service_endpoint=excluded.service_endpoint,
        installation_public_key=excluded.installation_public_key,
        source_updated_at=excluded.source_updated_at, expires_at=excluded.expires_at,
        signed_payload=excluded.signed_payload, signature=excluded.signature,
        publication_idempotency_key=excluded.publication_idempotency_key,
        status='active', published_at=excluded.published_at
      WHERE excluded.source_updated_at > catalog_listings.source_updated_at`,
  ).bind(
    row.listing_id,
    row.merchant_instance_id,
    row.capability,
    row.title,
    row.summary,
    row.location,
    row.currency,
    row.minimum_amount,
    row.media_url,
    row.service_endpoint,
    row.installation_public_key,
    row.source_updated_at,
    row.expires_at,
    row.signed_payload,
    row.signature,
    row.publication_idempotency_key,
    row.published_at,
  ).run();
  if ((result.meta?.changes ?? 0) !== 1) {
    throw new Error('catalog_listing_not_newer');
  }
}
