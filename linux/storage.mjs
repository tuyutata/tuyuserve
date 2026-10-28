import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import pg from 'pg';

const { Pool, types } = pg;

const BUSINESS_TABLE_COLUMNS = Object.freeze({
  users: ['tuyu_id', 'user_state', 'created_at', 'updated_at'],
  signers: ['signer_id', 'tuyu_id', 'account_id', 'key_revision', 'device_id', 'signer_state', 'bound_at', 'revoked_at', 'updated_at'],
  instances: ['instance_id', 'owner_id', 'instance_key', 'instance_name', 'merchant_type', 'service_endpoint', 'instance_state', 'registered_at', 'updated_at'],
  grants: ['instance_id', 'admin_id', 'grant_state', 'issuer_id', 'issuer_signer', 'granted_at', 'revoked_at'],
  contacts: ['contact_id', 'tuyu_id', 'contact_type', 'lookup_hash', 'cipher_data', 'cipher_nonce', 'cipher_mac', 'verified_at', 'created_at', 'updated_at'],
  challenges: ['challenge_id', 'tuyu_id', 'signer_id', 'key_revision', 'account_id', 'product_id', 'device_id', 'expires_at', 'used_at'],
  sessions: ['token_hash', 'tuyu_id', 'signer_id', 'key_revision', 'account_id', 'product_id', 'device_id', 'created_at', 'expires_at', 'revoked_at'],
  nonces: ['nonce_hash', 'tuyu_id', 'product_id', 'expires_at'],
  events: ['event_id', 'tuyu_id', 'event_type', 'product_id', 'device_id', 'signer_id', 'instance_id', 'created_at'],
  releases: ['product_id', 'platform_name', 'version_tag'],
  listings: ['listing_id', 'instance_id', 'service_kind', 'listing_title', 'listing_summary', 'listing_location', 'instance_key', 'source_time', 'expires_at', 'signed_payload', 'payload_signature', 'request_key', 'listing_state', 'published_at'],
  posts: ['trip_id', 'author_id', 'post_title', 'post_body', 'media_keys', 'request_key', 'post_state', 'created_at', 'updated_at'],
});

// 中文注释：表序从唯一字段清单派生，导入、导出与结构校验共用。
const BUSINESS_TABLES = Object.freeze(Object.keys(BUSINESS_TABLE_COLUMNS));

const STORAGE_TABLE_COLUMNS = Object.freeze({
  entries: ['entry_key', 'entry_value', 'expires_at', 'metadata_json'],
  objects: ['object_key', 'byte_size', 'object_etag', 'http_metadata', 'custom_metadata'],
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
      'SELECT entry_value, expires_at FROM entries WHERE entry_key = $1',
      [key],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      await this.pool.query('DELETE FROM entries WHERE entry_key = $1', [key]);
      return null;
    }
    const bytes = Buffer.from(row.entry_value);
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
      `INSERT INTO entries (entry_key, entry_value, expires_at, metadata_json) VALUES ($1, $2, $3, $4)
       ON CONFLICT(entry_key) DO UPDATE SET entry_value=excluded.entry_value, expires_at=excluded.expires_at,
       metadata_json=excluded.metadata_json`,
      [key, bytes, expiresAt, JSON.stringify(options.metadata ?? null)],
    );
  }

  async delete(key) {
    await this.pool.query('DELETE FROM entries WHERE entry_key = $1', [key]);
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
  const metadata = JSON.parse(String(row.http_metadata));
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
    size: row.byte_size,
    range,
    httpEtag: `"${String(row.object_etag)}"`,
    customMetadata: JSON.parse(String(row.custom_metadata)),
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
      `SELECT object_key, byte_size, object_etag, http_metadata, custom_metadata
       FROM objects WHERE object_key = $1`,
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
    const bytes = await readFile(join(this.directory, objectFileName(row.object_key)));
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
    // 中文注释：先核对所属 public Schema，旧表或半套结构必须失败，不能旁建第二套表。
    const expectedColumns = { ...BUSINESS_TABLE_COLUMNS, ...STORAGE_TABLE_COLUMNS };
    const existing = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    if (existing.rows.length === 0) {
      await client.query(await readFile(schemaFile, 'utf8'));
      await client.query(`
        CREATE TABLE entries (
          entry_key TEXT PRIMARY KEY,
          entry_value BYTEA NOT NULL,
          expires_at BIGINT,
          metadata_json TEXT NOT NULL
        );
        CREATE TABLE objects (
          object_key TEXT PRIMARY KEY,
          byte_size BIGINT NOT NULL CHECK(byte_size >= 0),
          object_etag TEXT NOT NULL,
          http_metadata TEXT NOT NULL,
          custom_metadata TEXT NOT NULL
        );
      `);
    } else if (existing.rows.map(row => row.table_name).sort().join('\0')
        !== Object.keys(expectedColumns).sort().join('\0')) {
      throw new Error('PostgreSQL 表不符合唯一最终结构，拒绝自动补齐或重建');
    }
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
