import { createHash } from 'node:crypto';
import {
  cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BUSINESS_TABLE_COLUMNS,
  BUSINESS_TABLES,
  createPostgresPool,
  initializePostgres,
  postgresConfiguration,
} from './storage.mjs';

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodedBase64(value) {
  if (typeof value !== 'string' || value.length > 34_952_536
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error('KV 导出值无效');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('KV 导出值不是规范 Base64');
  return bytes;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function stringMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

function exactStrings(left, right) {
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function databaseRows(bytes, table) {
  const text = bytes.toString('utf8');
  if (text.length === 0) return [];
  if (!text.endsWith('\n')) throw new Error(`数据库表导出未以换行结束: ${table}`);
  return text.slice(0, -1).split('\n').map((line) => {
    let row;
    try { row = JSON.parse(line); } catch {
      throw new Error(`数据库表导出包含无效 JSON: ${table}`);
    }
    const columns = BUSINESS_TABLE_COLUMNS[table];
    if (!exactKeys(row, columns)
        || Object.values(row).some((value) => value !== null
          && typeof value !== 'string'
          && !(typeof value === 'number' && Number.isSafeInteger(value)))) {
      throw new Error(`数据库表导出记录无效: ${table}`);
    }
    return row;
  });
}

function postgresBinary(name) {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const prefix = process.env.TUYUSERVE_POSTGRES_BIN ?? join(dirname(moduleDirectory), 'postgresql', 'bin');
  return join(prefix, name);
}

function createDatabaseBackup(configuration, target) {
  const result = spawnSync(postgresBinary('pg_dump'), [
    '--format=custom',
    '--compress=none',
    '--no-owner',
    '--no-privileges',
    '--host', configuration.host,
    '--port', String(configuration.port),
    '--username', configuration.user,
    '--dbname', configuration.database,
    '--file', target,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      LD_LIBRARY_PATH: [join(dirname(postgresBinary('pg_dump')), '..', 'lib'),
        process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
      ...(configuration.password ? { PGPASSWORD: configuration.password } : {}),
    },
  });
  if (result.status !== 0) throw new Error(`PostgreSQL 导入前备份失败: ${result.stderr}`);
}

const archiveArgument = process.argv[2];
const dataArgument = process.argv[3] ?? process.env.TUYUSERVE_DATA;
if (!archiveArgument || !dataArgument) {
  throw new Error('用法: node import.mjs <Cloudflare 导出归档> <TuyuServe 数据目录>');
}
const archive = resolve(archiveArgument);
const dataDirectory = resolve(dataArgument);
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const packagedSchema = join(dirname(moduleDirectory), 'share', 'schema.sql');
const defaultSchema = await lstat(packagedSchema)
  .then(() => packagedSchema, () => join(moduleDirectory, '..', 'schema.sql'));
const sourceSchema = resolve(process.env.TUYUSERVE_SCHEMA_FILE ?? defaultSchema);
const work = await mkdtemp(join(tmpdir(), 'tuyuserve-import-'));
const extracted = join(work, 'tuyuserve-export');
await mkdir(dirname(dataDirectory), { recursive: true });
// 中文注释：对象暂存区必须与正式数据目录同盘，最终 rename 才具备原子性。
const stageRoot = await mkdtemp(join(dirname(dataDirectory), '.tuyuserve-import-'));
const stagedObjects = join(stageRoot, 'objects');
let pool;

try {
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  if (listing.status !== 0) throw new Error('导出归档目录无法读取');
  const members = listing.stdout.split('\n').filter(Boolean);
  if (members.length === 0 || members.some((member) =>
    member.startsWith('/') || member.split('/').includes('..')
      || (member !== 'tuyuserve-export' && !member.startsWith('tuyuserve-export/')))) {
    throw new Error('导出归档包含越界路径');
  }
  const result = spawnSync('tar', ['-xzf', archive, '-C', work], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('导出归档无法解包');
  const extractedRoot = await realpath(extracted);
  const validateExtractedTree = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await validateExtractedTree(path);
      else {
        const metadata = await lstat(path);
        if (!entry.isFile() || metadata.nlink !== 1) throw new Error('导出归档包含链接或特殊文件');
      }
    }
  };
  await validateExtractedTree(extracted);
  const requireRegularFile = async (path) => {
    const metadata = await lstat(path);
    const resolved = await realpath(path);
    if (!metadata.isFile() || metadata.nlink !== 1 || !resolved.startsWith(`${extractedRoot}/`)) {
      throw new Error('导出归档包含非普通文件');
    }
  };
  await requireRegularFile(join(extracted, 'manifest.json'));
  const manifest = JSON.parse(await readFile(join(extracted, 'manifest.json'), 'utf8'));
  if (!exactKeys(manifest, ['kind', 'created_at', 'database', 'kv', 'objects'])
      || manifest.kind !== 'tuyuserve-cloud-export'
      || typeof manifest.created_at !== 'string'
      || Number.isNaN(Date.parse(manifest.created_at))
      || !exactKeys(manifest.database, ['tables'])
      || !Array.isArray(manifest.database.tables)
      || !Array.isArray(manifest.kv)
      || !Array.isArray(manifest.objects)) {
    throw new Error('导出清单无效');
  }
  const rootNames = (await readdir(extracted)).sort();
  if (rootNames.join('\0') !== ['database', 'manifest.json', 'objects'].join('\0')) {
    throw new Error('导出归档根目录包含未登记内容');
  }
  if (manifest.database.tables.length !== BUSINESS_TABLES.length) {
    throw new Error('数据库表清单不完整');
  }
  const tableRows = new Map();
  for (let index = 0; index < BUSINESS_TABLES.length; index += 1) {
    const name = BUSINESS_TABLES[index];
    const entry = manifest.database.tables[index];
    const file = `database/${name}.ndjson`;
    if (!exactKeys(entry, ['name', 'file', 'columns', 'row_count', 'sha256'])
        || entry.name !== name || entry.file !== file
        || !exactStrings(entry.columns, BUSINESS_TABLE_COLUMNS[name])
        || !Number.isSafeInteger(entry.row_count) || entry.row_count < 0
        || !/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      throw new Error(`数据库表清单无效: ${name}`);
    }
    const path = join(extracted, file);
    await requireRegularFile(path);
    const bytes = await readFile(path);
    if (hash(bytes) !== entry.sha256) throw new Error(`数据库表校验失败: ${name}`);
    const rows = databaseRows(bytes, name);
    if (rows.length !== entry.row_count) throw new Error(`数据库表行数不符: ${name}`);
    tableRows.set(name, rows);
  }
  const databaseNames = (await readdir(join(extracted, 'database'))).sort();
  const expectedDatabaseNames = BUSINESS_TABLES.map((name) => `${name}.ndjson`).sort();
  if (databaseNames.join('\0') !== expectedDatabaseNames.join('\0')) {
    throw new Error('数据库目录包含未登记内容');
  }
  await mkdir(stagedObjects, { recursive: true, mode: 0o750 });
  const kv = [];
  for (const entry of manifest.kv) {
    const metadata = JSON.stringify(entry?.metadata);
    if (!exactKeys(entry, ['key', 'expiration', 'metadata', 'value_base64'])
        || typeof entry.key !== 'string' || Buffer.byteLength(entry.key) < 1
        || Buffer.byteLength(entry.key) > 512
        || (entry.expiration !== null && (!Number.isSafeInteger(entry.expiration)
          || entry.expiration <= 0
          || entry.expiration > Math.floor(Number.MAX_SAFE_INTEGER / 1_000)))
        || metadata === undefined) {
      throw new Error('KV 导出记录无效');
    }
    kv.push({
      key: entry.key,
      value: decodedBase64(entry.value_base64),
      expiresAt: entry.expiration ? entry.expiration * 1_000 : null,
      metadata,
    });
  }
  const objects = [];
  for (const entry of manifest.objects) {
    if (!exactKeys(entry, [
      'key', 'file', 'size', 'sha256', 'etag', 'http_metadata', 'custom_metadata',
    ])
        || typeof entry.key !== 'string' || Buffer.byteLength(entry.key) < 1
        || Buffer.byteLength(entry.key) > 1_024
        || entry.file !== `${hash(entry.key)}.bin`
        || !Number.isSafeInteger(entry.size) || entry.size < 0
        || !/^[0-9a-f]{64}$/u.test(entry.sha256)
        || typeof entry.etag !== 'string' || entry.etag.length < 1 || entry.etag.length > 256
        || !stringMap(entry.http_metadata) || !stringMap(entry.custom_metadata)) {
      throw new Error('对象导出记录无效');
    }
    const source = join(extracted, 'objects', entry.file);
    await requireRegularFile(source);
    const bytes = await readFile(source);
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) {
      throw new Error(`对象校验失败: ${entry.key}`);
    }
    await cp(source, join(stagedObjects, entry.file));
    objects.push(entry);
  }
  const objectNames = (await readdir(join(extracted, 'objects'))).sort();
  const expectedObjectNames = objects.map((entry) => entry.file).sort();
  if (objectNames.join('\0') !== expectedObjectNames.join('\0')) {
    throw new Error('对象目录包含未登记内容');
  }

  await mkdir(dataDirectory, { recursive: true, mode: 0o750 });
  const receiptFile = join(dataDirectory, 'cloudflare-import.json');
  try {
    await lstat(receiptFile);
    throw new Error('Cloudflare 导入收据已存在，禁止覆盖');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const configuration = postgresConfiguration();
  pool = createPostgresPool(configuration);
  await initializePostgres(pool, sourceSchema);
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const backupDirectory = join(dataDirectory, 'backups');
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const databaseBackup = join(backupDirectory, `before-cloudflare-import-${timestamp}.dump`);
  createDatabaseBackup(configuration, databaseBackup);
  const currentObjects = join(dataDirectory, 'objects');
  await mkdir(currentObjects, { recursive: true, mode: 0o750 });
  if ((await readdir(currentObjects)).length !== 0) {
    throw new Error('目标对象目录不是空目录，拒绝覆盖');
  }
  const rollbackObjects = join(dataDirectory, `objects.before-cloudflare-import-${timestamp}`);
  const client = await pool.connect();
  let previousObjectsMoved = false;
  let objectsSwitched = false;
  try {
    await client.query('BEGIN');
    for (const table of [...BUSINESS_TABLES, 'tuyu_kv', 'tuyu_objects']) {
      const state = await client.query(`SELECT EXISTS (SELECT 1 FROM "${table}" LIMIT 1) AS used`);
      if (state.rows[0].used) throw new Error(`目标 PostgreSQL 表不是空表: ${table}`);
    }
    for (const name of BUSINESS_TABLES) {
      const columns = BUSINESS_TABLE_COLUMNS[name];
      const identifiers = columns.map((column) => `"${column}"`).join(', ');
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      for (const row of tableRows.get(name)) {
        await client.query(
          `INSERT INTO "${name}" (${identifiers}) VALUES (${placeholders})`,
          columns.map((column) => row[column]),
        );
      }
    }
    for (const entry of kv) {
      await client.query(
        `INSERT INTO tuyu_kv (key, value, expires_at, metadata_json)
         VALUES ($1, $2, $3, $4)`,
        [entry.key, entry.value, entry.expiresAt, entry.metadata],
      );
    }
    for (const entry of objects) {
      await client.query(
        `INSERT INTO tuyu_objects
         (object_key, file_name, size, etag, http_metadata_json, custom_metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          entry.key,
          entry.file,
          entry.size,
          entry.etag,
          JSON.stringify(entry.http_metadata),
          JSON.stringify(entry.custom_metadata),
        ],
      );
    }
    // 中文注释：先切换已验真的对象目录，再提交数据库；提交失败时恢复原对象目录。
    await rename(currentObjects, rollbackObjects);
    previousObjectsMoved = true;
    await rename(stagedObjects, currentObjects);
    objectsSwitched = true;
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {
      // 中文注释：连接已断开时仍必须优先恢复对象目录，数据库由导入前备份兜底。
    }
    if (objectsSwitched) {
      await rename(currentObjects, stagedObjects);
      await rename(rollbackObjects, currentObjects);
    } else if (previousObjectsMoved) {
      await rename(rollbackObjects, currentObjects);
    }
    throw error;
  } finally {
    client.release();
  }
  await writeFile(receiptFile, `${JSON.stringify({
    source: 'cloudflare',
    imported_at: new Date().toISOString(),
    database_backup: databaseBackup,
    objects_backup: rollbackObjects,
  }, null, 2)}\n`, { mode: 0o600 });
} finally {
  if (pool) await pool.end();
  await Promise.all([
    rm(work, { recursive: true, force: true }),
    rm(stageRoot, { recursive: true, force: true }),
  ]);
}
