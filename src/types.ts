export type TuyuAudience =
  | 'tuyulove'
  | 'tuyulife'
  | 'tuyuserve'
  | 'tuyubooking'
  | 'tuyufactory';
export type UserStatus = 'active' | 'frozen' | 'closed';
export type SignerStatus = 'active' | 'revoked';
export type MerchantRole = 'MERCHANT_OWNER' | 'MERCHANT_ADMIN';
export type ListingCapability = 'hotel' | 'restaurant' | 'tour' | 'ticket';

export interface Env {
  DB: D1Database;
  SESSION_CACHE: KVNamespace;
  DOWNLOADS: R2Bucket;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  CHALLENGE_TTL_SECONDS?: string;
  SESSION_TTL_SECONDS?: string;
}

export interface UserRow {
  tuyu_id: string;
  status: UserStatus;
  created_at: number;
  updated_at: number;
}

export interface TuyuSignerRow {
  signer_id: string;
  tuyu_id: string;
  account_id: string;
  key_revision: number;
  device_id: string;
  status: SignerStatus;
  bound_at: number;
  revoked_at: number | null;
  updated_at: number;
}

export interface MerchantInstanceRow {
  merchant_instance_id: string;
  merchant_tuyu_id: string;
  installation_public_key: string;
  installation_name: string;
  merchant_type: 'hotel' | 'restaurant' | 'tour' | 'scenic' | 'mixed';
  service_endpoint: string | null;
  status: 'active' | 'suspended' | 'retired';
  registered_at: number;
  updated_at: number;
}

export interface MerchantGrantRow {
  merchant_instance_id: string;
  administrator_tuyu_id: string;
  role: 'MERCHANT_ADMIN';
  status: 'active' | 'revoked';
  granted_by_tuyu_id: string;
  granted_by_signer_id: string;
  granted_at: number;
  revoked_at: number | null;
}

export interface LoginChallengeRow {
  challenge_id: string;
  tuyu_id: string;
  signer_id: string;
  key_revision: number;
  account_id: string;
  audience: TuyuAudience;
  device_id: string;
  signing_payload: string;
  expires_at: number;
  used_at: number | null;
}

export interface SessionState {
  tuyu_id: string;
  signer_id: string;
  key_revision: number;
  account_id: string;
  audience: TuyuAudience;
  device_id: string;
  created_at: number;
  expires_at: number;
}

export interface CatalogListingRow {
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
  installation_public_key: string;
  source_updated_at: number;
  expires_at: number;
  signed_payload: string;
  signature: string;
  publication_idempotency_key: string;
  status: 'active' | 'withdrawn';
  published_at: number;
}

export interface TripPostRow {
  trip_id: string;
  author_tuyu_id: string;
  title: string;
  content: string;
  media_keys_json: string;
  idempotency_key: string;
  status: 'published' | 'deleted';
  created_at: number;
  updated_at: number;
}
