#!/usr/bin/env node
// CI_BUILD: incremental

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function required(value, message) {
  if (!value) throw new Error(message);
}

function run(file, args, cwd = process.cwd(), env = process.env) {
  execFileSync(file, args, { cwd, stdio: 'inherit', env });
}

function verifyArm64() {
  const machine = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim();
  required(process.platform === 'linux' && process.arch === 'arm64'
      && ['aarch64', 'arm64'].includes(machine),
    `途遇服务端 Linux CI 必须运行在真实 ARM64，实际 ${process.arch}/${machine}`);
}

async function smoke(artifact, root) {
  const extracted = join(root, 'extracted');
  run('mkdir', ['-p', extracted]);
  run('tar', ['-xzf', artifact, '-C', extracted]);
  const home = join(extracted, 'tuyuserve');
  const node = join(home, 'node', 'bin', 'node');
  const identity = execFileSync('file', [node], { encoding: 'utf8' });
  required(/ELF 64-bit.*ARM aarch64/u.test(identity), `安装包 Node 架构无效: ${identity}`);
  const postgresBin = join(home, 'postgresql', 'bin');
  for (const name of ['postgres', 'initdb', 'pg_dump', 'pg_restore']) {
    const postgresIdentity = execFileSync('file', [join(postgresBin, name)], { encoding: 'utf8' });
    required(/ELF 64-bit.*ARM aarch64/u.test(postgresIdentity),
      `安装包 PostgreSQL ${name} 架构无效: ${postgresIdentity}`);
  }
  const postgresData = join(root, 'postgresql');
  const postgresSocket = join(root, 'postgresql-socket');
  run('mkdir', ['-p', postgresSocket]);
  const postgresEnvironment = {
    ...process.env,
    LD_LIBRARY_PATH: join(home, 'postgresql', 'lib'),
  };
  run(join(postgresBin, 'initdb'), [
    '--pgdata', postgresData, '--username', 'postgres', '--auth', 'trust', '--no-locale',
    '--encoding', 'UTF8',
  ], process.cwd(), postgresEnvironment);
  run(join(postgresBin, 'pg_ctl'), [
    '--pgdata', postgresData,
    '--log', join(root, 'postgresql.log'),
    '--options', `-F -k ${postgresSocket} -p 15432 -c listen_addresses=`,
    '--wait', 'start',
  ], process.cwd(), postgresEnvironment);
  let postgresStarted = true;
  run(join(postgresBin, 'createdb'), [
    '--host', postgresSocket, '--port', '15432', '--username', 'postgres', 'tuyuserve',
  ], process.cwd(), postgresEnvironment);
  run('npm', ['run', 'test:linux'], 'tuyuserve', {
    ...process.env,
    TUYUSERVE_TEST_POSTGRES_BIN: postgresBin,
    LD_LIBRARY_PATH: join(home, 'postgresql', 'lib'),
  });
  const certificate = join(root, 'tls.crt');
  const key = join(root, 'tls.key');
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', key, '-out', certificate,
  ]);
  const port = '18443';
  const server = spawn(node, [join(home, 'lib', 'server.mjs')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TUYUSERVE_HOME: home,
      TUYUSERVE_DATA: join(root, 'data'),
      TUYUSERVE_TLS_CERT: certificate,
      TUYUSERVE_TLS_KEY: key,
      TUYUSERVE_HOST: '127.0.0.1',
      TUYUSERVE_PORT: port,
      TUYUSERVE_POSTGRES_HOST: postgresSocket,
      TUYUSERVE_POSTGRES_PORT: '15432',
      TUYUSERVE_POSTGRES_DATABASE: 'tuyuserve',
      TUYUSERVE_POSTGRES_USER: 'postgres',
      LD_LIBRARY_PATH: join(home, 'postgresql', 'lib'),
    },
  });
  let stderr = '';
  server.stderr.on('data', (data) => { stderr += data.toString(); });
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (server.exitCode !== null) throw new Error(`服务进程提前退出: ${stderr}`);
      try {
        const health = execFileSync('curl', [
          '--fail', '--silent', '--show-error', '--cacert', certificate,
          `https://127.0.0.1:${port}/v1/health`,
        ], { encoding: 'utf8' });
        const document = JSON.parse(health);
        required(document.ok === true && document.service === 'tuyuserve', '健康响应身份无效');
        return;
      } catch {
        // 中文注释：服务尚未就绪时继续有界轮询，进程退出则立即失败。
      }
    }
    throw new Error(`途遇服务端 Linux ARM64 运行态健康验收超时: ${stderr}`);
  } finally {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => server.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    if (postgresStarted) {
      run(join(postgresBin, 'pg_ctl'), [
        '--pgdata', postgresData, '--wait', 'stop',
      ], process.cwd(), postgresEnvironment);
      postgresStarted = false;
    }
  }
}

const work = mkdtempSync(join(tmpdir(), 'tuyuserve-ci-'));
try {
  verifyArm64();
  run('npm', ['ci'], 'tuyuserve');
  run('npm', ['test'], 'tuyuserve');
  run('npm', ['run', 'typecheck'], 'tuyuserve');
  run('npm', ['run', 'build:linux'], 'tuyuserve', {
    ...process.env,
    TUYUSERVE_OUTPUT: join(work, 'output'),
    TUYUSERVE_WORK: join(work, 'build'),
  });
  const artifact = join(work, 'output', 'tuyuserve-linux-arm64.tar.gz');
  required(readFileSync(artifact).length > 0, '途遇服务端 Linux ARM64 安装包为空');
  await smoke(artifact, work);
} catch (error) {
  console.error(`途遇服务端 Linux ARM64 CI 失败：${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
