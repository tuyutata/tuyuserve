-- TuyuServe D1 与 PostgreSQL 共用的唯一最终 schema。
-- 中文注释：本文件只使用两端共同支持的 SQL；外键启用属于各运行适配器职责。

-- 途遇号是主体身份；具体人员和设备通过多条 sr25519 signer 绑定操作。
CREATE TABLE users (
  tuyu_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'frozen', 'closed')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE tuyu_signers (
  signer_id TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE,
  key_revision INTEGER NOT NULL CHECK (key_revision > 0),
  device_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  bound_at BIGINT NOT NULL,
  revoked_at BIGINT,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  UNIQUE (tuyu_id, signer_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX idx_tuyu_signers_tuyu_status ON tuyu_signers(tuyu_id, status);

CREATE TABLE merchant_instances (
  merchant_instance_id TEXT PRIMARY KEY,
  merchant_tuyu_id TEXT NOT NULL,
  installation_public_key TEXT NOT NULL UNIQUE,
  installation_name TEXT NOT NULL,
  merchant_type TEXT NOT NULL CHECK (merchant_type IN ('hotel', 'restaurant', 'tour', 'scenic', 'mixed')),
  service_endpoint TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'retired')),
  registered_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (merchant_tuyu_id) REFERENCES users(tuyu_id) ON DELETE RESTRICT
);
CREATE INDEX idx_merchant_instances_owner ON merchant_instances(merchant_tuyu_id, status);

CREATE TABLE merchant_instance_grants (
  merchant_instance_id TEXT NOT NULL,
  administrator_tuyu_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role = 'MERCHANT_ADMIN'),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  granted_by_tuyu_id TEXT NOT NULL,
  granted_by_signer_id TEXT NOT NULL,
  granted_at BIGINT NOT NULL,
  revoked_at BIGINT,
  PRIMARY KEY (merchant_instance_id, administrator_tuyu_id),
  FOREIGN KEY (merchant_instance_id) REFERENCES merchant_instances(merchant_instance_id) ON DELETE CASCADE,
  FOREIGN KEY (administrator_tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by_tuyu_id) REFERENCES users(tuyu_id) ON DELETE RESTRICT,
  FOREIGN KEY (granted_by_signer_id) REFERENCES tuyu_signers(signer_id) ON DELETE RESTRICT,
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX idx_merchant_grants_admin ON merchant_instance_grants(administrator_tuyu_id, status);

-- 手机号和邮箱只用于安全增强，原文只允许保存应用层密文。
CREATE TABLE user_contacts (
  contact_id TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('phone', 'email')),
  lookup_hash TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  mac TEXT NOT NULL,
  verified_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE
);
CREATE INDEX idx_user_contacts_tuyu_id ON user_contacts(tuyu_id);

-- 登录挑战绑定当前密钥版本、目标产品和设备，且只能原子消费一次。
CREATE TABLE login_challenges (
  challenge_id TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  key_revision INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (
    audience IN ('tuyulove', 'tuyulife', 'tuyuserve', 'tuyubooking', 'tuyufactory')
  ),
  device_id TEXT NOT NULL,
  signing_payload TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  FOREIGN KEY (signer_id) REFERENCES tuyu_signers(signer_id) ON DELETE CASCADE
);
CREATE INDEX idx_login_challenges_tuyu_id ON login_challenges(tuyu_id);
CREATE INDEX idx_login_challenges_expires_at ON login_challenges(expires_at);

-- 明文 Session Token 不进入 D1，这里只保存不可逆 SHA-256 索引。
CREATE TABLE sessions (
  session_token_hash TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  key_revision INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (
    audience IN ('tuyulove', 'tuyulife', 'tuyuserve', 'tuyubooking', 'tuyufactory')
  ),
  device_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  FOREIGN KEY (signer_id) REFERENCES tuyu_signers(signer_id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_tuyu_id ON sessions(tuyu_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE request_nonces (
  nonce_hash TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (
    audience IN ('tuyulove', 'tuyulife', 'tuyuserve', 'tuyubooking', 'tuyufactory')
  ),
  expires_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE
);
CREATE INDEX idx_request_nonces_expires_at ON request_nonces(expires_at);

-- 安全事件不保存签名、Token、手机号或邮箱原文。
CREATE TABLE security_events (
  event_id TEXT PRIMARY KEY,
  tuyu_id TEXT,
  event_type TEXT NOT NULL,
  audience TEXT,
  device_id TEXT,
  signer_id TEXT,
  merchant_instance_id TEXT,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE SET NULL
);
CREATE INDEX idx_security_events_tuyu_id_created_at
  ON security_events(tuyu_id, created_at DESC);

-- 每个平台只保存一个当前公开版本指针；安装包正文保存在对应运行时的对象存储。
CREATE TABLE software_releases (
  product_id TEXT NOT NULL CHECK (product_id IN ('tuyubooking', 'tuyufactory')),
  platform TEXT NOT NULL CHECK (platform IN ('macos', 'linux', 'windows')),
  version_tag TEXT NOT NULL,
  PRIMARY KEY (product_id, platform)
);

-- 商家公开发现记录只保存签名摘要和权威 HTTPS 地址，不保存实时库存或订单。
CREATE TABLE catalog_listings (
  listing_id TEXT PRIMARY KEY,
  merchant_instance_id TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('hotel', 'restaurant', 'tour', 'ticket')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  location TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  minimum_amount BIGINT NOT NULL CHECK (minimum_amount >= 0),
  media_url TEXT,
  service_endpoint TEXT NOT NULL,
  installation_public_key TEXT NOT NULL,
  source_updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  signed_payload TEXT NOT NULL,
  signature TEXT NOT NULL,
  publication_idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'withdrawn')),
  published_at BIGINT NOT NULL,
  FOREIGN KEY (merchant_instance_id) REFERENCES merchant_instances(merchant_instance_id)
    ON DELETE CASCADE,
  CHECK (expires_at > source_updated_at)
);
CREATE INDEX idx_catalog_discovery
  ON catalog_listings(capability, status, expires_at, source_updated_at DESC);

-- 游记正文属于途遇云端内容；媒体文件继续保存在对象存储中。
CREATE TABLE trip_posts (
  trip_id TEXT PRIMARY KEY,
  author_tuyu_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  media_keys_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'deleted')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (author_tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  UNIQUE (author_tuyu_id, idempotency_key)
);
CREATE INDEX idx_trip_posts_public ON trip_posts(status, created_at DESC);
