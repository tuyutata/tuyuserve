import type { CatalogListingRow, Env, ServiceKind } from '../types';

export async function readListingByIdempotencyKey(
  env: Env,
  requestKey: string,
): Promise<CatalogListingRow | null> {
  return env.DB.prepare(
    `SELECT * FROM listings WHERE request_key = ?`,
  ).bind(requestKey).first<CatalogListingRow>();
}

export async function readListing(
  env: Env,
  listingId: string,
): Promise<CatalogListingRow | null> {
  return env.DB.prepare(
    `SELECT * FROM listings WHERE listing_id = ? AND listing_state = 'active' AND expires_at > ?`,
  ).bind(listingId, Date.now()).first<CatalogListingRow>();
}

export async function listListings(
  env: Env,
  serviceKind: ServiceKind | null,
  query: string,
  limit: number,
): Promise<CatalogListingRow[]> {
  const pattern = `%${query}%`;
  const statement = serviceKind
    ? env.DB.prepare(
      `SELECT * FROM listings
        WHERE listing_state = 'active' AND expires_at > ? AND service_kind = ?
          AND (? = '' OR LOWER(listing_title) LIKE LOWER(?) OR LOWER(listing_summary) LIKE LOWER(?)
            OR LOWER(listing_location) LIKE LOWER(?))
        ORDER BY source_time DESC, listing_id ASC LIMIT ?`,
    ).bind(Date.now(), serviceKind, query, pattern, pattern, pattern, limit)
    : env.DB.prepare(
      `SELECT * FROM listings
        WHERE listing_state = 'active' AND expires_at > ?
          AND (? = '' OR LOWER(listing_title) LIKE LOWER(?) OR LOWER(listing_summary) LIKE LOWER(?)
            OR LOWER(listing_location) LIKE LOWER(?))
        ORDER BY source_time DESC, listing_id ASC LIMIT ?`,
    ).bind(Date.now(), query, pattern, pattern, pattern, limit);
  return (await statement.all<CatalogListingRow>()).results;
}

export async function saveListing(env: Env, row: CatalogListingRow): Promise<void> {
  const result = await env.DB.prepare(
    `INSERT INTO listings
      (listing_id, instance_id, service_kind, listing_title, listing_summary, listing_location,
       instance_key, source_time, expires_at, signed_payload, payload_signature,
       request_key, listing_state, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT(listing_id) DO UPDATE SET
        instance_id=excluded.instance_id, service_kind=excluded.service_kind,
        listing_title=excluded.listing_title, listing_summary=excluded.listing_summary,
        listing_location=excluded.listing_location, instance_key=excluded.instance_key,
        source_time=excluded.source_time, expires_at=excluded.expires_at,
        signed_payload=excluded.signed_payload, payload_signature=excluded.payload_signature,
        request_key=excluded.request_key, listing_state='active', published_at=excluded.published_at
      WHERE excluded.source_time > listings.source_time`,
  ).bind(
    row.listing_id, row.instance_id, row.service_kind, row.listing_title, row.listing_summary,
    row.listing_location, row.instance_key, row.source_time, row.expires_at,
    row.signed_payload, row.payload_signature, row.request_key, row.published_at,
  ).run();
  if ((result.meta?.changes ?? 0) !== 1) throw new Error('catalog_listing_not_newer');
}
