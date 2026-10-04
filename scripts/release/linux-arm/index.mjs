#!/usr/bin/env node
// RELEASE_BUILD: full; CARGO_INCREMENTAL=0
// 当前入口按产品与平台验真 CI 来源，并创建对应的 GitHub Release 资产。

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const identity = Object.freeze({
  product: 'tuyuserve',
  platform: 'linux-arm',
  prefix: 'tuyuserve-linux-arm-v',
  ciTitle: '途遇服务端 · LinuxARM · CI',
  workflow: 'tuyuserve.linux-arm.release',
  asset: 'tuyuserve-linux-arm64.tar.gz',
});
const output = join(process.env.RUNNER_TEMP || '/tmp', 'tuyuserve-linux-release');

function required(value, message) { if (!value) throw new Error(message); }
function run(file, args, cwd = process.cwd(), env = process.env) {
  execFileSync(file, args, { cwd, stdio: 'inherit', env });
}
function githubJSON(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', env: process.env }));
}
function hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d{0,1})\.(0|[1-9]\d{0,1})$/u.exec(value || '');
  required(match, `Linux ARM64 软件版本无效：${value || '(empty)'}`);
  return match.slice(1).map(Number);
}
function baseInputs() {
  const value = {
    repository: process.env.GITHUB_REPOSITORY,
    source: process.env.SOURCE_SHA,
    ciRunID: process.env.CI_RUN_ID,
  };
  required(value.repository === 'tuyutata/tuyuserve', '途遇服务仓库身份无效');
  required(/^[0-9a-f]{40}$/u.test(value.source || ''), 'Linux ARM64 Release 源提交无效');
  required(/^[1-9][0-9]*$/u.test(value.ciRunID || ''), 'Linux ARM64 CI Run ID 无效');
  return value;
}
function inputs() {
  const value = {
    ...baseInputs(), version: process.env.SOFTWARE_VERSION, tag: process.env.VERSION_TAG,
  };
  parseVersion(value.version);
  required(value.tag === `${identity.prefix}${value.version}`, 'Linux ARM64 Tag 无效');
  return value;
}
function verify(value) {
  const machine = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim();
  required(process.platform === 'linux' && process.arch === 'arm64'
      && ['aarch64', 'arm64'].includes(machine),
    `Linux ARM64 Release runner 无效: ${process.arch}/${machine}`);
  required(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === value.source,
    'Linux ARM64 源码提交不一致');
  const runInfo = githubJSON(['api', `repos/${value.repository}/actions/runs/${value.ciRunID}`]);
  required(
    String(runInfo?.id) === value.ciRunID
      && runInfo?.head_sha === value.source
      && runInfo?.head_branch === 'main'
      && runInfo?.event === 'workflow_dispatch'
      && runInfo?.status === 'completed'
      && runInfo?.conclusion === 'success'
      && String(runInfo?.display_title || '') === identity.ciTitle
      && String(runInfo?.path || '').endsWith('/tuyuserve-linux-arm-ci.yml'),
    'Linux ARM64 CI Run 身份不一致',
  );
}
function applyVersion(version) {
  for (const path of ['tuyuserve/package.json', 'tuyuserve/package-lock.json']) {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    value.version = version;
    if (path.endsWith('package-lock.json')) {
      required(value.packages?.[''], 'TuyuServe package-lock 根包缺失');
      value.packages[''].version = version;
    }
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }
}
function build(value) {
  verify(value);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  applyVersion(value.version);
  run('npm', ['ci'], 'tuyuserve');
  run('npm', ['test'], 'tuyuserve');
  run('npm', ['run', 'typecheck'], 'tuyuserve');
  run('npm', ['run', 'build:linux'], 'tuyuserve', {
    ...process.env,
    TUYUSERVE_OUTPUT: output,
    TUYUSERVE_WORK: join(output, 'work'),
  });
  const asset = join(output, identity.asset);
  required(existsSync(asset), '途遇服务端 Linux ARM64 正式安装包不存在');
  const fileIdentity = execFileSync('tar', [
    '-xOf', asset, 'tuyuserve/node/bin/node',
  ], { maxBuffer: 256 * 1024 * 1024 });
  const nodeCopy = join(output, 'node-arm64');
  writeFileSync(nodeCopy, fileIdentity, { mode: 0o755 });
  const architecture = execFileSync('file', [nodeCopy], { encoding: 'utf8' });
  required(/ELF 64-bit.*ARM aarch64/u.test(architecture), `正式安装包架构无效: ${architecture}`);
  const verificationRoot = join(output, 'verification');
  run('mkdir', ['-p', verificationRoot]);
  run('tar', ['-xzf', asset, '-C', verificationRoot]);
  const packagedHome = join(verificationRoot, 'tuyuserve');
  const postgresBin = join(packagedHome, 'postgresql', 'bin');
  for (const name of ['postgres', 'initdb', 'pg_dump', 'pg_restore']) {
    const postgresArchitecture = execFileSync('file', [join(postgresBin, name)], {
      encoding: 'utf8',
    });
    required(/ELF 64-bit.*ARM aarch64/u.test(postgresArchitecture),
      `正式安装包 PostgreSQL ${name} 架构无效: ${postgresArchitecture}`);
  }
  const postgresEnvironment = {
    ...process.env,
    LD_LIBRARY_PATH: join(packagedHome, 'postgresql', 'lib'),
  };
  const postgresVersion = execFileSync(join(postgresBin, 'postgres'), ['--version'], {
    encoding: 'utf8', env: postgresEnvironment,
  }).trim();
  required(postgresVersion === 'postgres (PostgreSQL) 17.11',
    `正式安装包 PostgreSQL 版本无效: ${postgresVersion}`);
  run('npm', ['run', 'test:linux'], 'tuyuserve', {
    ...postgresEnvironment,
    TUYUSERVE_TEST_POSTGRES_BIN: postgresBin,
  });
  rmSync(verificationRoot, { recursive: true, force: true });
  const manifest = join(output, 'release-manifest.json');
  writeFileSync(manifest, `${JSON.stringify({
    product_id: identity.product,
    platform: identity.platform,
    software_version: value.version,
    git_commit_sha: value.source,
    ci_run_id: Number(value.ciRunID),
    assets: [{ name: identity.asset, sha256: hash(asset) }],
  }, null, 2)}\n`);
  writeFileSync(
    join(output, 'SHA256SUMS'),
    `${hash(asset)}  ${identity.asset}\n${hash(manifest)}  release-manifest.json\n`,
  );
}
function publish(value) {
  const assets = [identity.asset, 'release-manifest.json', 'SHA256SUMS']
    .map((name) => join(output, name));
  assets.forEach((path) => required(existsSync(path), `Linux ARM64 Release 资产缺失：${path}`));
  required(spawnSync('gh', ['release', 'view', value.tag, '--repo', value.repository], {
    stdio: 'ignore',
  }).status !== 0, 'Linux ARM64 正式 Release 已存在，禁止覆盖');
  required(spawnSync('gh', ['api', `repos/${value.repository}/git/ref/tags/${value.tag}`], {
    stdio: 'ignore',
  }).status !== 0, 'Linux ARM64 正式 Tag 已存在，禁止覆盖');
  run('gh', [
    'release', 'create', value.tag, ...assets,
    '--repo', value.repository,
    '--title', '途遇服务端 · Release · LinuxARM',
    '--notes', `途遇服务端 Linux ARM64 ${value.version}；SOURCE_SHA:${value.source}`,
    '--latest=false',
  ]);
}

try {
  const command = process.argv[2];
  const value = inputs();
  if (command === 'build-release') build(value);
  else if (command === 'publish-release') publish(value);
  else throw new Error(`Linux ARM64 Release 子命令未登记：${command || '(empty)'}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
