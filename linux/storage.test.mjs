import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { openStorage, objectFileName, postgresSql, createPostgresPool, BUSINESS_TABLE_COLUMNS } from './storage.mjs';

const postgresBin = process.env.TUYUSERVE_TEST_POSTGRES_BIN;

function command(path, args) {
  const result = spawnSync(path, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path}: ${result.stdout}${result.stderr}`);
}

async function withPostgres(run) {
  // 中文注释：PostgreSQL Unix Socket 有严格路径长度上限，测试根目录必须保持短路径。
  const root = await mkdtemp('/tmp/tuyuserve-pg-');
  const data = join(root, 'database');
  const socket = join(root, 'socket');
  const port = 20_000 + (process.pid % 20_000);
  await mkdir(socket, { mode: 0o700 });
  command(join(postgresBin, 'initdb'), [
    '--pgdata', data, '--username', 'postgres', '--auth', 'trust', '--no-locale',
    '--encoding', 'UTF8',
  ]);
  command(join(postgresBin, 'pg_ctl'), [
    '--pgdata', data,
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
    command(join(postgresBin, 'pg_ctl'), ['--pgdata', data, '--wait', 'stop']);
    await rm(root, { recursive: true, force: true });
  }
}

test('D1 问号占位符只转换 SQL 代码区', () => {
  assert.equal(
    postgresSql("SELECT ?, '?' AS literal, \"?\" AS identifier -- ?\nWHERE value = ? /* ? */"),
    "SELECT $1, '?' AS literal, \"?\" AS identifier -- ?\nWHERE value = $2 /* ? */",
  );
});

test('Linux 使用真实 PostgreSQL 承载业务表、KV 和对象元数据', {
  skip: postgresBin ? false : '需要 TUYUSERVE_TEST_POSTGRES_BIN 指向真实 PostgreSQL bin',
}, async () => withPostgres(async ({ root, configuration }) => {
  const dataDirectory = join(root, 'tuyuserve-data');
  const storage = await openStorage({
    dataDirectory,
    schemaFile: resolve('schema.sql'),
    postgres: configuration,
  });
  try {
    await storage.DB.prepare(
      'INSERT INTO users (tuyu_id, user_state, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).bind('TUYU-TEST', 'active', 1, 1).run();
    assert.equal(
      (await storage.DB.prepare('SELECT tuyu_id FROM users').first()).tuyu_id,
      'TUYU-TEST',
    );
    await storage.SESSION_CACHE.put('fixture', JSON.stringify({ ok: true }), {
      expirationTtl: 60,
    });
    assert.deepEqual(await storage.SESSION_CACHE.get('fixture', 'json'), { ok: true });
    const binary = Uint8Array.from([0, 255, 17]);
    await storage.SESSION_CACHE.put('binary', binary, { metadata: { kind: 'fixture' } });
    assert.deepEqual(
      new Uint8Array(await storage.SESSION_CACHE.get('binary', 'arrayBuffer')),
      binary,
    );

    const file = objectFileName('media/test.bin');
    await writeFile(join(dataDirectory, 'objects', file), Buffer.from('signed-object'));
    await storage.pool.query(
      `INSERT INTO objects
       (object_key, byte_size, object_etag, http_metadata, custom_metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      ['media/test.bin', 13, 'fixture-etag', '{"contentType":"text/plain"}',
        '{"purpose":"fixture"}'],
    );
    const object = await storage.DOWNLOADS.get('media/test.bin', {
      range: new Headers({ range: 'bytes=0-5' }),
    });
    assert.deepEqual(Buffer.from(object.body), Buffer.from('signed'));
    assert.deepEqual(object.customMetadata, { purpose: 'fixture' });

    await assert.rejects(
      storage.DB.prepare('SELECT 9223372036854775807::bigint AS value').first(),
      /超出安全整数范围/u,
    );
  } finally {
    await storage.close();
  }
}));


test('已有旧结构被拒绝且不会旁建新表', {
  skip: postgresBin ? false : '需要 TUYUSERVE_TEST_POSTGRES_BIN 指向真实 PostgreSQL bin',
}, async () => withPostgres(async ({ root, configuration }) => {
  const pool = createPostgresPool(configuration);
  try {
    // 中文注释：只在本测试独占临时库建立旧结构负例，生产初始化没有旧表名单或兼容分支。
    await pool.query('CREATE TABLE old_fixture (legacy_value text)');
    await assert.rejects(openStorage({ dataDirectory: join(root, 'data'),
      schemaFile: resolve('schema.sql'), postgres: configuration }), /唯一最终结构/u);
    const state = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    assert.deepEqual(state.rows.map(row => row.table_name), ['old_fixture']);
  } finally { await pool.end(); }
}));


test('共用DDL在SQLite实际建表，字段、外键和无恒定角色列一致', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(await readFile(resolve('schema.sql'), 'utf8'));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    assert.deepEqual(tables.map(row => row.name), Object.keys(BUSINESS_TABLE_COLUMNS).sort());
    for (const [name, columns] of Object.entries(BUSINESS_TABLE_COLUMNS)) {
      const actual = db.prepare(`PRAGMA table_info("${name}")`).all().map(row => row.name);
      assert.deepEqual(actual, columns);
      assert.ok(actual.every(column => /^[a-z]+_[a-z]+$/u.test(column)));
    }
    db.exec(`INSERT INTO users VALUES ('owner', 'active', 1, 1);
      INSERT INTO users VALUES ('admin', 'active', 1, 1);
      INSERT INTO signers VALUES ('signer', 'owner', 'account', 1, 'device', 'active', 1, NULL, 1);
      INSERT INTO instances VALUES ('instance', 'owner', 'key', 'name', 'hotel', NULL, 'active', 1, 1);
      INSERT INTO grants VALUES ('instance', 'admin', 'active', 'owner', 'signer', 1, NULL)`);
    assert.equal(db.prepare('SELECT admin_id FROM grants').get().admin_id, 'admin');
    assert.throws(() => db.prepare('SELECT role FROM grants'), /no such column/u);
    assert.throws(() => db.exec(`INSERT INTO grants VALUES
      ('missing', 'admin', 'active', 'owner', 'signer', 1, NULL)`), /FOREIGN KEY/u);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
