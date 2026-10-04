import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { openStorage, objectFileName, postgresSql } from './storage.mjs';

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
      'INSERT INTO users (tuyu_id, status, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).bind('TUYU-TEST', 'active', 1, 1).run();
    assert.equal(
      (await storage.DB.prepare('SELECT tuyu_id FROM users').first()).tuyu_id,
      'TUYU-TEST',
    );
    await storage.SESSION_CACHE.put('session', JSON.stringify({ ok: true }), {
      expirationTtl: 60,
    });
    assert.deepEqual(await storage.SESSION_CACHE.get('session', 'json'), { ok: true });
    const binary = Uint8Array.from([0, 255, 17]);
    await storage.SESSION_CACHE.put('binary', binary, { metadata: { kind: 'fixture' } });
    assert.deepEqual(
      new Uint8Array(await storage.SESSION_CACHE.get('binary', 'arrayBuffer')),
      binary,
    );

    const file = objectFileName('media/test.bin');
    await writeFile(join(dataDirectory, 'objects', file), Buffer.from('signed-object'));
    await storage.pool.query(
      `INSERT INTO tuyu_objects
       (object_key, file_name, size, etag, http_metadata_json, custom_metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['media/test.bin', file, 13, 'fixture-etag', '{"contentType":"text/plain"}',
        '{"purpose":"fixture"}'],
    );
    const object = await storage.DOWNLOADS.get('media/test.bin', {
      range: new Headers({ range: 'bytes=0-5' }),
    });
    assert.deepEqual(Buffer.from(object.body), Buffer.from('signed'));
    assert.deepEqual(object.customMetadata, { purpose: 'fixture' });

    await storage.DB.prepare(
      'INSERT INTO users (tuyu_id, status, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).bind('TUYU-A', 'active', 1, 1).run();
    await storage.DB.prepare(
      'INSERT INTO users (tuyu_id, status, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).bind('TUYU-Z', 'active', 1, 1).run();
    await storage.DB.prepare(
      `INSERT INTO chat_conversations
       (conversation_id, participant_a, participant_b, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind('TCC-TEST', 'TUYU-A', 'TUYU-Z', 1, 1).run();
    const allocations = await Promise.all(Array.from({ length: 24 }, () =>
      storage.DB.prepare(
        `UPDATE chat_conversations SET next_sequence = next_sequence + 1
         WHERE conversation_id = ? RETURNING next_sequence`,
      ).bind('TCC-TEST').first()));
    assert.deepEqual(
      allocations.map((row) => row.next_sequence).sort((left, right) => left - right),
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    await assert.rejects(
      storage.DB.prepare('SELECT 9223372036854775807::bigint AS value').first(),
      /超出安全整数范围/u,
    );
  } finally {
    await storage.close();
  }
}));
