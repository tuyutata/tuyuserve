import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { BUSINESS_TABLE_COLUMNS, openStorage } from './storage.mjs';

const postgresBin = process.env.TUYUSERVE_TEST_POSTGRES_BIN;

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function command(path, args) {
  const result = spawnSync(path, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path}: ${result.stdout}${result.stderr}`);
}

async function withPostgres(run) {
  // 中文注释：PostgreSQL Unix Socket 有严格路径长度上限，测试根目录必须保持短路径。
  const root = await mkdtemp('/tmp/tuyuserve-import-pg-');
  const database = join(root, 'database');
  const socket = join(root, 'socket');
  const port = 40_000 + (process.pid % 10_000);
  await mkdir(socket, { mode: 0o700 });
  command(join(postgresBin, 'initdb'), [
    '--pgdata', database, '--username', 'postgres', '--auth', 'trust', '--no-locale',
    '--encoding', 'UTF8',
  ]);
  command(join(postgresBin, 'pg_ctl'), [
    '--pgdata', database,
    '--log', join(root, 'postgresql.log'),
    '--options', `-F -k ${socket} -p ${port} -c listen_addresses=`,
    '--wait', 'start',
  ]);
  const configuration = { host: socket, port, database: 'tuyuserve', user: 'postgres' };
  try {
    command(join(postgresBin, 'createdb'), [
      '--host', socket, '--port', String(port), '--username', 'postgres', 'tuyuserve',
    ]);
    await run({ root, configuration });
  } finally {
    command(join(postgresBin, 'pg_ctl'), ['--pgdata', database, '--wait', 'stop']);
    await rm(root, { recursive: true, force: true });
  }
}

async function cloudflareArchive(root) {
  const payload = join(root, 'archive', 'tuyuserve-export');
  const objects = join(payload, 'objects');
  const database = join(payload, 'database');
  await mkdir(objects, { recursive: true });
  await mkdir(database, { recursive: true });
  const tableManifests = [];
  for (const [name, columns] of Object.entries(BUSINESS_TABLE_COLUMNS)) {
    const rows = name === 'users'
      ? [{ tuyu_id: 'TUYU-1', status: 'active', created_at: 1, updated_at: 1 }]
      : [];
    const bytes = Buffer.from(rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
    const file = `database/${name}.ndjson`;
    await writeFile(join(payload, file), bytes);
    tableManifests.push({ name, file, columns, row_count: rows.length, sha256: hash(bytes) });
  }
  const object = Buffer.from('signed media');
  const file = `${hash('media/trip.jpg')}.bin`;
  await writeFile(join(objects, file), object);
  await writeFile(join(payload, 'manifest.json'), `${JSON.stringify({
    kind: 'tuyuserve-cloud-export',
    created_at: new Date().toISOString(),
    database: { tables: tableManifests },
    kv: [{
      key: 'tuyu_session:test', value_base64: Buffer.from('{"ok":true}').toString('base64'),
      expiration: null, metadata: { audience: 'tuyulove' },
    }],
    objects: [{
      key: 'media/trip.jpg', file, size: object.length, sha256: hash(object),
      etag: hash(object), http_metadata: { contentType: 'image/jpeg' },
      custom_metadata: { purpose: 'trip' },
    }],
  })}\n`);
  const archive = join(root, 'cloudflare.tar.gz');
  command('tar', ['-czf', archive, '-C', join(root, 'archive'), 'tuyuserve-export']);
  return { archive, file, object };
}

test('Cloudflare D1、KV 和 R2 归档可导入真实 PostgreSQL', {
  skip: postgresBin ? false : '需要 TUYUSERVE_TEST_POSTGRES_BIN 指向真实 PostgreSQL bin',
}, async () => withPostgres(async ({ root, configuration }) => {
  const fixture = await cloudflareArchive(root);
  const data = join(root, 'tuyuserve-data');
  await mkdir(data);
  await writeFile(join(data, 'previous.txt'), 'preserved data');
  const environment = {
    ...process.env,
    TUYUSERVE_POSTGRES_BIN: postgresBin,
    TUYUSERVE_POSTGRES_HOST: configuration.host,
    TUYUSERVE_POSTGRES_PORT: String(configuration.port),
    TUYUSERVE_POSTGRES_DATABASE: configuration.database,
    TUYUSERVE_POSTGRES_USER: configuration.user,
  };
  const result = spawnSync(process.execPath, [
    new URL('./import.mjs', import.meta.url).pathname, fixture.archive, data,
  ], { encoding: 'utf8', env: environment });
  assert.equal(result.status, 0, result.stderr);

  const storage = await openStorage({
    dataDirectory: data,
    schemaFile: resolve('schema.sql'),
    postgres: configuration,
  });
  try {
    assert.equal((await storage.DB.prepare('SELECT tuyu_id FROM users').first()).tuyu_id, 'TUYU-1');
    assert.deepEqual(await storage.SESSION_CACHE.get('tuyu_session:test', 'json'), { ok: true });
    const importedObject = await storage.DOWNLOADS.get('media/trip.jpg', {
      range: new Headers({ range: 'bytes=0-5' }),
    });
    assert.deepEqual(Buffer.from(importedObject.body), Buffer.from('signed'));
    assert.deepEqual(importedObject.customMetadata, { purpose: 'trip' });
  } finally {
    await storage.close();
  }
  assert.deepEqual(await readFile(join(data, 'objects', fixture.file)), fixture.object);
  assert.equal(await readFile(join(data, 'previous.txt'), 'utf8'), 'preserved data');
  const receipt = JSON.parse(await readFile(join(data, 'cloudflare-import.json'), 'utf8'));
  await access(receipt.database_backup);
  await access(receipt.objects_backup);

  const repeated = spawnSync(process.execPath, [
    new URL('./import.mjs', import.meta.url).pathname, fixture.archive, data,
  ], { encoding: 'utf8', env: environment });
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /收据已存在|不是空表|不是空目录/u);
}));

test('Linux构建要求CI和Release显式目录，缺项时不取包或写盘', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('./build.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("if (process.platform !== 'linux'");
  const end = source.indexOf('const runtimeLock =', start);
  assert.ok(start >= 0 && end > start);
  // 执行真实构建前置控制流，只替换宿主事实与只读 uname；不装入后面的读取、下载或写盘命令。
  const prepare = environment => runInNewContext(source.slice(start, end) + '\n({output, work, stage})', {
    process: { platform: 'linux', arch: 'arm64', env: environment }, resolve, join,
    spawnSync: (command, args) => {
      assert.equal(command, 'uname'); assert.deepEqual(Array.from(args), ['-m']);
      return { stdout: 'aarch64\n' };
    },
  });
  for (const environment of [{}, { TUYUSERVE_OUTPUT: '/runner/output' }, { TUYUSERVE_WORK: '/runner/work' },
    { TUYUSERVE_OUTPUT: '/runner/output', TUYUSERVE_WORK: '' }, { TUYUSERVE_OUTPUT: ' ', TUYUSERVE_WORK: '/runner/work' }]) {
    assert.throws(() => prepare(environment), /必须显式提供 TUYUSERVE_OUTPUT 和 TUYUSERVE_WORK/u);
  }
  for (const environment of [
    { TUYUSERVE_OUTPUT: '/runner/ci/output', TUYUSERVE_WORK: '/runner/ci/build' },
    { TUYUSERVE_OUTPUT: '/runner/release/output', TUYUSERVE_WORK: '/runner/release/output/work' },
  ]) {
    const result = prepare(environment);
    assert.equal(result.output, environment.TUYUSERVE_OUTPUT);
    assert.equal(result.work, environment.TUYUSERVE_WORK);
    assert.equal(result.stage, join(environment.TUYUSERVE_WORK, 'tuyuserve'));
  }
});

test('导入器未指定目标目录时失败关闭', () => {
  const result = spawnSync(process.execPath, [
    new URL('./import.mjs', import.meta.url).pathname, '/tmp/not-used.tar.gz',
  ], { encoding: 'utf8', env: { ...process.env, TUYUSERVE_DATA: '' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /用法/u);
});

test('Cloudflare 导出器未确认停止写入时失败关闭', () => {
  const result = spawnSync(process.execPath, [
    new URL('./cloudflare-export.mjs', import.meta.url).pathname,
    '/tmp/tuyuserve-export-must-not-exist.tar.gz',
  ], {
    encoding: 'utf8',
    env: { ...process.env, TUYUSERVE_WRITES_FROZEN: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /必须停止途遇服务端写入/u);
});
