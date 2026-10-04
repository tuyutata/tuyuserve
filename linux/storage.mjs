import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import pg from 'pg';

const { Pool, types } = pg;

const BUSINESS_TABLES = Object.freeze([
  'users',
  'tuyu_signers',
  'merchant_instances',
  'merchant_instance_grants',
  'user_contacts',
  'login_challenges',
  'sessions',
  'request_nonces',
  'security_events',
  'software_releases',
  'catalog_listings',
  'trip_posts',
  'chat_conversations',
  'chat_messages',
]);

const BUSINESS_TABLE_COLUMNS = Object.freeze({
  users: ['tuyu_id', 'status', 'created_at', 'updated_at'],
  tuyu_signers: [
    'signer_id', 'tuyu_id', 'account_id', 'key_revision', 'device_id', 'status',
    'bound_at', 'revoked_at', 'updated_at',
  ],
  merchant_instances: [
    'merchant_instance_id', 'merchant_tuyu_id', 'installation_public_key',
    'installation_name', 'merchant_type', 'service_endpoint', 'status', 'registered_at',
    'updated_at',
  ],
  merchant_instance_grants: [
    'merchant_instance_id', 'administrator_tuyu_id', 'role', 'status', 'granted_by_tuyu_id',
    'granted_by_signer_id', 'granted_at', 'revoked_at',
  ],
  user_contacts: [
    'contact_id', 'tuyu_id', 'contact_type', 'lookup_hash', 'ciphertext', 'nonce', 'mac',
    'verified_at', 'created_at', 'updated_at',
  ],
  login_challenges: [
    'challenge_id', 'tuyu_id', 'signer_id', 'key_revision', 'account_id', 'audience',
    'device_id', 'signing_payload', 'expires_at', 'used_at',
  ],
  sessions: [
    'session_token_hash', 'tuyu_id', 'signer_id', 'key_revision', 'account_id', 'audience',
    'device_id', 'created_at', 'expires_at', 'revoked_at',
  ],
  request_nonces: ['nonce_hash', 'tuyu_id', 'audience', 'expires_at'],
  security_events: [
    'event_id', 'tuyu_id', 'event_type', 'audience', 'device_id', 'signer_id',
    'merchant_instance_id', 'created_at',
  ],
  software_releases: ['product_id', 'platform', 'version_tag'],
  catalog_listings: [
    'listing_id', 'merchant_instance_id', 'capability', 'title', 'summary', 'location',
    'currency', 'minimum_amount', 'media_url', 'service_endpoint',
    'installation_public_key', 'source_updated_at', 'expires_at', 'signed_payload',
    'signature', 'publication_idempotency_key', 'status', 'published_at',
  ],
  trip_posts: [
    'trip_id', 'author_tuyu_id', 'title', 'content', 'media_keys_json', 'idempotency_key',
    'status', 'created_at', 'updated_at',
  ],
  chat_conversations: [
    'conversation_id', 'participant_a', 'participant_b', 'next_sequence', 'created_at',
    'updated_at',
  ],
  chat_messages: [
    'message_id', 'conversation_id', 'sender_tuyu_id', 'sequence', 'content',
    'idempotency_key', 'created_at',
  ],
});

const STORAGE_TABLE_COLUMNS = Object.freeze({
  tuyu_kv: ['key', 'value', 'expires_at', 'metadata_json'],
  tuyu_objects: [
    'object_key', 'file_name', 'size', 'etag', 'http_metadata_json', 'custom_metadata_json',
  ],
});

// 中文注释：服务内时间戳和序号必须保持 JavaScript 安全整数，禁止静默损失精度。
types.setTypeParser(20, (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`PostgreSQL BIGINT 超出安全整数范围: ${value}`);
  return parsed;
});

function params(values) {
  return values.map((value) => value === undefined ? null : value);
}

function postgresPort(value) {
  const parsed = Number(value ?? '5432');
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error('TUYUSERVE_POSTGRES_PORT 无效');
  }
  return parsed;
}

export function postgresConfiguration(environment = process.env) {
  const configuration = {
    host: environment.TUYUSERVE_POSTGRES_HOST ?? '/run/tuyuserve-postgresql',
    port: postgresPort(environment.TUYUSERVE_POSTGRES_PORT),
    database: environment.TUYUSERVE_POSTGRES_DATABASE ?? 'tuyuserve',
    user: environment.TUYUSERVE_POSTGRES_USER ?? 'tuyuserve_app',
    application_name: 'tuyuserve',
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  };
  const password = environment.TUYUSERVE_POSTGRES_PASSWORD;
  return password ? { ...configuration, password } : configuration;
}

export function createPostgresPool(configuration = postgresConfiguration()) {
  return new Pool(configuration);
}

// 中文注释：D1 使用问号占位符，Linux 适配器只转换 SQL 代码区，绝不改写字符串或注释。
export function postgresSql(sql) {
  let output = '';
  let position = 1;
  let state = 'code';
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (state === 'code') {
      if (current === "'") state = 'single';
      else if (current === '"') state = 'double';
      else if (current === '-' && next === '-') state = 'line-comment';
      else if (current === '/' && next === '*') state = 'block-comment';
      if (current === '?' && state === 'code') output += `$${position++}`;
      else output += current;
      continue;
    }
    output += current;
    if (state === 'single' && current === "'") {
      if (next === "'") output += sql[++index];
      else state = 'code';
    } else if (state === 'double' && current === '"') {
      if (next === '"') output += sql[++index];
      else state = 'code';
    } else if (state === 'line-comment' && current === '\n') {
      state = 'code';
    } else if (state === 'block-comment' && current === '*' && next === '/') {
      output += sql[++index];
      state = 'code';
    }
  }
  if (state === 'single' || state === 'double' || state === 'block-comment') {
    throw new Error('SQL 文本未闭合');
  }
  return output;
}

class Statement {
  constructor(pool, sql, values = []) {
    this.pool = pool;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new Statement(this.pool, this.sql, params(values));
  }

  async first() {
    const result = await this.pool.query(postgresSql(this.sql), this.values);
    return result.rows[0] ?? null;
  }

  async all() {
    const result = await this.pool.query(postgresSql(this.sql), this.values);
    return { results: result.rows };
  }

  async run() {
    const result = await this.pool.query(postgresSql(this.sql), this.values);
    return { success: true, meta: { changes: result.rowCount ?? 0 } };
  }
}

class Database {
  constructor(pool) {
    this.pool = pool;
  }

  prepare(sql) {
    return new Statement(this.pool, sql);
  }
}

class Kv {
  constructor(pool) {
    this.pool = pool;
  }

  async get(key, type = 'text') {
    const result = await this.pool.query(
      'SELECT value, expires_at FROM tuyu_kv WHERE key = $1',
      [key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      await this.pool.query('DELETE FROM tuyu_kv WHERE key = $1', [key]);
      return null;
    }
    const bytes = Buffer.from(row.value);
    if (type === 'arrayBuffer') {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    const value = bytes.toString('utf8');
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key, value, options = {}) {
    const expiresAt = options.expiration
      ? Number(options.expiration) * 1_000
      : options.expirationTtl ? Date.now() + Number(options.expirationTtl) * 1_000 : null;
    if (expiresAt !== null && !Number.isSafeInteger(expiresAt)) throw new Error('KV 到期时间无效');
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
    await this.pool.query(
      `INSERT INTO tuyu_kv (key, value, expires_at, metadata_json) VALUES ($1, $2, $3, $4)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at,
       metadata_json=excluded.metadata_json`,
      [key, bytes, expiresAt, JSON.stringify(options.metadata ?? null)],
    );
  }

  async delete(key) {
    await this.pool.query('DELETE FROM tuyu_kv WHERE key = $1', [key]);
  }
}

function rangeFrom(headers, size) {
  const value = headers?.get?.('range');
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match || (match[1] === '' && match[2] === '')) return { invalid: true };
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true };
    const length = Math.min(suffix, size);
    return { suffix, offset: size - length, length };
  }
  const offset = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end)
      || offset < 0 || offset >= size || end < offset) return { invalid: true };
  return { offset, length: Math.min(end, size - 1) - offset + 1 };
}

function objectView(row, body, range) {
  const metadata = JSON.parse(String(row.http_metadata_json));
  const headerNames = {
    cacheControl: 'cache-control',
    cacheExpiry: 'expires',
    contentDisposition: 'content-disposition',
    contentEncoding: 'content-encoding',
    contentLanguage: 'content-language',
    contentType: 'content-type',
  };
  return {
    body,
    size: row.size,
    range,
    httpEtag: `"${String(row.etag)}"`,
    customMetadata: JSON.parse(String(row.custom_metadata_json)),
    writeHttpMetadata(headers) {
      for (const [name, value] of Object.entries(metadata)) {
        const header = headerNames[name];
        if (header && typeof value === 'string' && value.length > 0) headers.set(header, value);
      }
    },
  };
}

class Objects {
  constructor(pool, directory) {
    this.pool = pool;
    this.directory = directory;
  }

  async row(key) {
    const result = await this.pool.query(
      `SELECT object_key, file_name, size, etag, http_metadata_json, custom_metadata_json
       FROM tuyu_objects WHERE object_key = $1`,
      [key],
    );
    return result.rows[0] ?? null;
  }

  async head(key) {
    const row = await this.row(key);
    return row ? objectView(row, null, undefined) : null;
  }

  async get(key, options = {}) {
    const row = await this.row(key);
    if (!row) return null;
    if (!/^[0-9a-f]{64}\.bin$/u.test(row.file_name)) throw new Error('对象文件名无效');
    const bytes = await readFile(join(this.directory, row.file_name));
    const range = rangeFrom(options.range, bytes.length);
    if (range?.invalid) {
      return objectView(row, new Uint8Array(), { offset: bytes.length, length: 0 });
    }
    if (!range) return objectView(row, bytes, undefined);
    return objectView(
      row,
      bytes.subarray(range.offset, range.offset + range.length),
      { offset: range.offset, length: range.length },
    );
  }
}

export async function initializePostgres(pool, schemaFile) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [BUSINESS_TABLES],
    );
    if (existing.rows.length === 0) {
      await client.query(await readFile(schemaFile, 'utf8'));
    } else if (existing.rows.length !== BUSINESS_TABLES.length) {
      throw new Error('PostgreSQL 业务表不完整，拒绝自动补齐非最终结构');
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS tuyu_kv (
        key TEXT PRIMARY KEY,
        value BYTEA NOT NULL,
        expires_at BIGINT,
        metadata_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tuyu_objects (
        object_key TEXT PRIMARY KEY,
        file_name TEXT NOT NULL UNIQUE,
        size BIGINT NOT NULL CHECK(size >= 0),
        etag TEXT NOT NULL,
        http_metadata_json TEXT NOT NULL,
        custom_metadata_json TEXT NOT NULL
      );
    `);
    const expectedColumns = { ...BUSINESS_TABLE_COLUMNS, ...STORAGE_TABLE_COLUMNS };
    const actual = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name, ordinal_position`,
      [Object.keys(expectedColumns)],
    );
    for (const [table, columns] of Object.entries(expectedColumns)) {
      const names = actual.rows
        .filter((row) => row.table_name === table)
        .map((row) => row.column_name);
      if (names.join('\0') !== columns.join('\0')) {
        throw new Error(`PostgreSQL 表字段不符合唯一最终结构: ${table}`);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function openStorage({ dataDirectory, schemaFile, postgres }) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o750 });
  const objectDirectory = join(dataDirectory, 'objects');
  await mkdir(objectDirectory, { recursive: true, mode: 0o750 });
  const pool = createPostgresPool(postgres ?? postgresConfiguration());
  try {
    await initializePostgres(pool, schemaFile);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return {
    DB: new Database(pool),
    SESSION_CACHE: new Kv(pool),
    DOWNLOADS: new Objects(pool, objectDirectory),
    pool,
    close: () => pool.end(),
  };
}

export function objectFileName(key) {
  return `${createHash('sha256').update(key).digest('hex')}.bin`;
}

export { BUSINESS_TABLES, BUSINESS_TABLE_COLUMNS };
