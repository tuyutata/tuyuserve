export type ProductId =
  | 'tuyulove'
  | 'tuyulife'
  | 'tuyuserve'
  | 'tuyubooking'
  | 'tuyufactory';
export type UserState = 'active' | 'frozen' | 'closed';
export type SignerState = 'active' | 'revoked';
export type MerchantRole = 'MERCHANT_OWNER' | 'MERCHANT_ADMIN';
export type ServiceKind = 'hotel' | 'restaurant' | 'tour' | 'ticket';

export interface Env {
  DB: D1Database;
  SESSION_CACHE: KVNamespace;
  DOWNLOADS: R2Bucket;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  CHALLENGE_TTL_SECONDS?: string;
  SESSION_TTL_SECONDS?: string;
}

// 中文注释：Row 和原始 JSON 的键遵循数据库/API 合同，业务局部变量遵循 TypeScript 命名。
export interface UserRow {
  tuyu_id: string;
  user_state: UserState;
  created_at: number;
  updated_at: number;
}

export interface TuyuSignerRow {
  signer_id: string;
  tuyu_id: string;
  account_id: string;
  key_revision: number;
  device_id: string;
  signer_state: SignerState;
  bound_at: number;
  revoked_at: number | null;
  updated_at: number;
}

export interface MerchantInstanceRow {
  instance_id: string;
  owner_id: string;
  instance_key: string;
  instance_name: string;
  merchant_type: 'hotel' | 'restaurant' | 'tour' | 'scenic' | 'mixed';
  service_endpoint: string | null;
  instance_state: 'active' | 'suspended' | 'retired';
  registered_at: number;
  updated_at: number;
}

export interface MerchantGrantRow {
  instance_id: string;
  admin_id: string;
  grant_state: 'active' | 'revoked';
  issuer_id: string;
  issuer_signer: string;
  granted_at: number;
  revoked_at: number | null;
}

export interface LoginChallengeRow {
  challenge_id: string;
  tuyu_id: string;
  signer_id: string;
  key_revision: number;
  account_id: string;
  product_id: ProductId;
  device_id: string;
  expires_at: number;
  used_at: number | null;
}

export interface SessionState {
  tuyu_id: string;
  signer_id: string;
  key_revision: number;
  account_id: string;
  product_id: ProductId;
  device_id: string;
  created_at: number;
  expires_at: number;
}

export interface CatalogListingRow {
  listing_id: string;
  instance_id: string;
  service_kind: ServiceKind;
  listing_title: string;
  listing_summary: string;
  listing_location: string;
  instance_key: string;
  source_time: number;
  expires_at: number;
  signed_payload: string;
  payload_signature: string;
  request_key: string;
  listing_state: 'active' | 'withdrawn';
  published_at: number;
}

export interface TripPostRow {
  trip_id: string;
  author_id: string;
  post_title: string;
  post_body: string;
  media_keys: string;
  request_key: string;
  post_state: 'published' | 'deleted';
  created_at: number;
  updated_at: number;
}
