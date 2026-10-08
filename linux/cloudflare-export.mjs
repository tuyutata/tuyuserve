import { createHash } from 'node:crypto';
import {
  appendFile, lstat, mkdtemp, mkdir, readFile, rename, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { BUSINESS_TABLE_COLUMNS } from './storage.mjs';

const TABLE_ORDER = Object.freeze({
  users: ['tuyu_id'],
  tuyu_signers: ['signer_id'],
  merchant_instances: ['merchant_instance_id'],
  merchant_instance_grants: ['merchant_instance_id', 'administrator_tuyu_id'],
  user_contacts: ['contact_id'],
  login_challenges: ['challenge_id'],
  sessions: ['session_token_hash'],
  request_nonces: ['nonce_hash'],
  security_events: ['event_id'],
  software_releases: ['product_id', 'platform'],
  catalog_listings: ['listing_id'],
  trip_posts: ['trip_id'],
});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}`);
  return value;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function api(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { authorization: `Bearer ${required('CLOUDFLARE_API_TOKEN')}` },
  });
  if (!response.ok) throw new Error(`Cloudflare 导出失败: ${response.status} ${path}`);
  return response;
}

async function apiDocument(path) {
  const document = await api(path).then((response) => response.json());
  if (document?.success !== true || !Array.isArray(document.result)) {
    throw new Error(`Cloudflare 列表响应无效: ${path}`);
  }
  return document;
}

function d1Rows(sql) {
  const result = spawnSync(
    process.execPath,
    [
      resolve('node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'DB', '--remote', '--json', '--command', sql,
    ],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  if (result.status !== 0) throw new Error(`Cloudflare D1 导出失败: ${result.stderr}`);
  let document;
  try { document = JSON.parse(result.stdout); } catch {
    throw new Error('Cloudflare D1 返回了非 JSON 数据');
  }
  const blocks = Array.isArray(document) ? document : [document];
  if (blocks.length !== 1 || blocks[0]?.success !== true || !Array.isArray(blocks[0].results)) {
    throw new Error('Cloudflare D1 查询响应无效');
  }
  return blocks[0].results;
}

async function databaseTables(directory) {
  const manifests = [];
  for (const [name, columns] of Object.entries(BUSINESS_TABLE_COLUMNS)) {
    const file = `database/${name}.ndjson`;
    const target = join(directory, file);
    const order = TABLE_ORDER[name].map((column) => `"${column}"`).join(', ');
    const select = columns.map((column) => `"${column}"`).join(', ');
    let offset = 0;
    let rowCount = 0;
    while (true) {
      const rows = d1Rows(
        `SELECT ${select} FROM "${name}" ORDER BY ${order} LIMIT 500 OFFSET ${offset}`,
      );
      for (const row of rows) {
        if (Object.keys(row).sort().join('\0') !== [...columns].sort().join('\0')) {
          throw new Error(`Cloudflare D1 表字段无效: ${name}`);
        }
        await appendFile(target, `${JSON.stringify(row)}\n`, { mode: 0o600 });
      }
      rowCount += rows.length;
      if (rows.length < 500) break;
      offset += rows.length;
    }
    if (rowCount === 0) await writeFile(target, '', { mode: 0o600 });
    manifests.push({
      name,
      file,
      columns,
      row_count: rowCount,
      sha256: hash(await readFile(target)),
    });
  }
  return manifests;
}

async function kvEntries(accountId, namespaceId) {
  const entries = [];
  let cursor = '';
  do {
    const query = new URLSearchParams({ limit: '1000' });
    if (cursor) query.set('cursor', cursor);
    const document = await apiDocument(
      `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?${query}`,
    );
    for (const key of document.result ?? []) {
      const response = await api(
        `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key.name)}`,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      entries.push({
        key: key.name,
        expiration: key.expiration ?? null,
        metadata: key.metadata ?? null,
        value_base64: Buffer.from(bytes).toString('base64'),
      });
    }
    cursor = document.result_info?.cursor ?? '';
  } while (cursor);
  return entries;
}

async function r2Entries(accountId, bucket, directory) {
  const entries = [];
  let cursor = '';
  do {
    const query = new URLSearchParams({ per_page: '1000' });
    if (cursor) query.set('cursor', cursor);
    const document = await apiDocument(
      `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/objects?${query}`,
    );
    for (const object of document.result ?? []) {
      const objectPath = object.key.split('/').map(encodeURIComponent).join('/');
      const response = await api(
        `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/objects/${objectPath}`,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = `${hash(new TextEncoder().encode(object.key))}.bin`;
      await writeFile(join(directory, file), bytes, { mode: 0o600 });
      entries.push({
        key: object.key,
        file,
        size: bytes.length,
        sha256: hash(bytes),
        etag: object.etag ?? hash(bytes),
        http_metadata: object.http_metadata ?? {},
        custom_metadata: object.custom_metadata ?? {},
      });
    }
    cursor = document.result_info?.is_truncated
      ? document.result_info.cursor ?? ''
      : '';
  } while (cursor);
  return entries;
}

const output = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !output.endsWith('.tar.gz')) {
  throw new Error('用法: node cloudflare-export.mjs <绝对或相对的 .tar.gz 输出路径>');
}
if (process.env.TUYUSERVE_WRITES_FROZEN !== 'confirmed') {
  throw new Error('导出前必须停止途遇服务端写入并设置 TUYUSERVE_WRITES_FROZEN=confirmed');
}
const accountId = required('CLOUDFLARE_ACCOUNT_ID');
const namespaceId = required('TUYUSERVE_KV_NAMESPACE_ID');
const bucket = process.env.TUYUSERVE_R2_BUCKET ?? 'tuyubooking';
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
try {
  await lstat(output);
  throw new Error('导出目标已存在，禁止覆盖');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const outputStage = await mkdtemp(join(dirname(output), '.tuyuserve-export-output-'));
const candidate = join(outputStage, basename(output));
const work = await mkdtemp(join(tmpdir(), 'tuyuserve-export-'));
const payload = join(work, 'tuyuserve-export');
const objects = join(payload, 'objects');

try {
  await mkdir(join(payload, 'database'), { recursive: true, mode: 0o700 });
  await mkdir(objects, { recursive: true, mode: 0o700 });
  const [tables, kv, r2] = await Promise.all([
    databaseTables(payload),
    kvEntries(accountId, namespaceId),
    r2Entries(accountId, bucket, objects),
  ]);
  kv.sort((left, right) => left.key.localeCompare(right.key));
  r2.sort((left, right) => left.key.localeCompare(right.key));
  const manifest = {
    kind: 'tuyuserve-cloud-export',
    created_at: new Date().toISOString(),
    database: { tables },
    kv,
    objects: r2,
  };
  await writeFile(join(payload, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  const archive = spawnSync('tar', ['-czf', candidate, '-C', work, basename(payload)], {
    stdio: 'inherit',
  });
  if (archive.status !== 0) throw new Error('Cloudflare 导出归档创建失败');
  await rename(candidate, output);
} finally {
  await Promise.all([
    rm(work, { recursive: true, force: true }),
    rm(outputStage, { recursive: true, force: true }),
  ]);
}
