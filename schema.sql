-- TuyuServe D1 与 PostgreSQL 共用的唯一最终 schema。
-- 中文注释：本文件只使用两端共同支持的 SQL；外键启用属于各运行适配器职责。

-- 途遇号是主体身份；具体人员和设备通过多条 sr25519 signer 绑定操作。
CREATE TABLE users (
  tuyu_id TEXT PRIMARY KEY,
  user_state TEXT NOT NULL CHECK (user_state IN ('active', 'frozen', 'closed')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE signers (
  signer_id TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE,
  key_revision INTEGER NOT NULL CHECK (key_revision > 0),
  device_id TEXT NOT NULL,
  signer_state TEXT NOT NULL CHECK (signer_state IN ('active', 'revoked')),
  bound_at BIGINT NOT NULL,
  revoked_at BIGINT,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  UNIQUE (tuyu_id, signer_id),
  CHECK ((signer_state = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX signers_user_idx ON signers(tuyu_id, signer_state);

CREATE TABLE instances (
  instance_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  instance_key TEXT NOT NULL UNIQUE,
  instance_name TEXT NOT NULL,
  merchant_type TEXT NOT NULL CHECK (merchant_type IN ('hotel', 'restaurant', 'tour', 'scenic', 'mixed')),
  service_endpoint TEXT,
  instance_state TEXT NOT NULL CHECK (instance_state IN ('active', 'suspended', 'retired')),
  registered_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(tuyu_id) ON DELETE RESTRICT
);
CREATE INDEX instances_owner_idx ON instances(owner_id, instance_state);

CREATE TABLE grants (
  instance_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  grant_state TEXT NOT NULL CHECK (grant_state IN ('active', 'revoked')),
  issuer_id TEXT NOT NULL,
  issuer_signer TEXT NOT NULL,
  granted_at BIGINT NOT NULL,
  revoked_at BIGINT,
  PRIMARY KEY (instance_id, admin_id),
  FOREIGN KEY (instance_id) REFERENCES instances(instance_id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  FOREIGN KEY (issuer_id) REFERENCES users(tuyu_id) ON DELETE RESTRICT,
  FOREIGN KEY (issuer_signer) REFERENCES signers(signer_id) ON DELETE RESTRICT,
  CHECK ((grant_state = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX grants_admin_idx ON grants(admin_id, grant_state);

-- 手机号和邮箱只用于安全增强，原文只允许保存应用层密文。
CREATE TABLE contacts (
  contact_id TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('phone', 'email')),
  lookup_hash TEXT NOT NULL UNIQUE,
  cipher_data TEXT NOT NULL,
  cipher_nonce TEXT NOT NULL,
  cipher_mac TEXT NOT NULL,
  verified_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE
);
CREATE INDEX contacts_user_idx ON contacts(tuyu_id);

-- 登录挑战绑定当前密钥版本、目标产品和设备，且只能原子消费一次。
CREATE TABLE challenges (
  challenge_id TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  key_revision INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  product_id TEXT NOT NULL CHECK (
    product_id IN ('tuyulove', 'tuyulife', 'tuyuserve', 'tuyubooking', 'tuyufactory')
  ),
  device_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  FOREIGN KEY (signer_id) REFERENCES signers(signer_id) ON DELETE CASCADE
);
CREATE INDEX challenges_user_idx ON challenges(tuyu_id);
CREATE INDEX challenges_expiry_idx ON challenges(expires_at);

-- 会话只归关系数据库，以不可逆 Token 哈希定位；不保存明文 Token 或 KV 会话副本。
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  key_revision INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  product_id TEXT NOT NULL CHECK (
    product_id IN ('tuyulove', 'tuyulife', 'tuyuserve', 'tuyubooking', 'tuyufactory')
  ),
  device_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  FOREIGN KEY (signer_id) REFERENCES signers(signer_id) ON DELETE CASCADE
);
CREATE INDEX sessions_user_idx ON sessions(tuyu_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE nonces (
  nonce_hash TEXT PRIMARY KEY,
  tuyu_id TEXT NOT NULL,
  product_id TEXT NOT NULL CHECK (
    product_id IN ('tuyulove', 'tuyulife', 'tuyuserve', 'tuyubooking', 'tuyufactory')
  ),
  expires_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE CASCADE
);
CREATE INDEX nonces_expiry_idx ON nonces(expires_at);

-- 安全事件不保存签名、Token、手机号或邮箱原文。
CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  tuyu_id TEXT,
  event_type TEXT NOT NULL,
  product_id TEXT,
  device_id TEXT,
  signer_id TEXT,
  instance_id TEXT,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (tuyu_id) REFERENCES users(tuyu_id) ON DELETE SET NULL
);
CREATE INDEX events_user_idx
  ON events(tuyu_id, created_at DESC);

-- 每个平台只保存一个当前公开版本指针；安装包正文保存在对应运行时的对象存储。
CREATE TABLE releases (
  product_id TEXT NOT NULL CHECK (product_id IN ('tuyubooking', 'tuyufactory')),
  platform_name TEXT NOT NULL CHECK (platform_name IN ('macos', 'linux', 'windows')),
  version_tag TEXT NOT NULL,
  PRIMARY KEY (product_id, platform_name)
);

-- 公开发现保留签名原文和查询投影；币种、价格、媒体和服务地址只从原文读取。
CREATE TABLE listings (
  listing_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  service_kind TEXT NOT NULL CHECK (service_kind IN ('hotel', 'restaurant', 'tour', 'ticket')),
  listing_title TEXT NOT NULL,
  listing_summary TEXT NOT NULL,
  listing_location TEXT NOT NULL,
  instance_key TEXT NOT NULL,
  source_time BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  signed_payload TEXT NOT NULL,
  payload_signature TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  listing_state TEXT NOT NULL CHECK (listing_state IN ('active', 'withdrawn')),
  published_at BIGINT NOT NULL,
  FOREIGN KEY (instance_id) REFERENCES instances(instance_id)
    ON DELETE CASCADE,
  CHECK (expires_at > source_time)
);
CREATE INDEX listings_discovery_idx
  ON listings(service_kind, listing_state, expires_at, source_time DESC);

-- 游记正文属于途遇云端内容；媒体文件继续保存在对象存储中。
CREATE TABLE posts (
  trip_id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  post_title TEXT NOT NULL,
  post_body TEXT NOT NULL,
  media_keys TEXT NOT NULL,
  request_key TEXT NOT NULL,
  post_state TEXT NOT NULL CHECK (post_state IN ('published', 'deleted')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(tuyu_id) ON DELETE CASCADE,
  UNIQUE (author_id, request_key)
);
CREATE INDEX posts_public_idx ON posts(post_state, created_at DESC);
