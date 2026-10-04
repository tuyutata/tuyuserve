import { availableParallelism } from 'node:os';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'linux' || process.arch !== 'arm64') {
  throw new Error('TuyuServe Linux 包必须在真实 Linux ARM64 主机上构建');
}
const machine = spawnSync('uname', ['-m'], { encoding: 'utf8' }).stdout.trim();
if (!['aarch64', 'arm64'].includes(machine)) throw new Error(`拒绝非 ARM64 主机: ${machine}`);

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`命令失败: ${file} ${args.join(' ')}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// CI/Release 已分别传入自己的输出和工作目录；缺少任何一个都不得猜测平铺本机路径。
if (!process.env.TUYUSERVE_OUTPUT?.trim() || !process.env.TUYUSERVE_WORK?.trim()) {
  throw new Error('TuyuServe Linux 构建必须显式提供 TUYUSERVE_OUTPUT 和 TUYUSERVE_WORK');
}
const output = resolve(process.env.TUYUSERVE_OUTPUT);
const work = resolve(process.env.TUYUSERVE_WORK);
const stage = join(work, 'tuyuserve');
const runtimeLock = JSON.parse(await readFile(resolve('linux/postgresql.runtime.lock.json'), 'utf8'));
if (runtimeLock.component !== 'PostgreSQL'
    || runtimeLock.version !== '17.11'
    || runtimeLock.architecture !== 'linux-arm64'
    || runtimeLock.install_prefix !== '/opt/tuyuserve/postgresql'
    || !/^https:\/\/ftp\.postgresql\.org\//u.test(runtimeLock.source_url)
    || !/^[0-9a-f]{64}$/u.test(runtimeLock.source_sha256)
    || !Array.isArray(runtimeLock.configure_options)
    || runtimeLock.configure_options.some((option) => typeof option !== 'string')) {
  throw new Error('PostgreSQL 运行时锁定文件无效');
}

await rm(work, { recursive: true, force: true });
await mkdir(join(stage, 'lib'), { recursive: true });
await mkdir(join(stage, 'share', 'licenses'), { recursive: true });
await mkdir(join(stage, 'system'), { recursive: true });

const sourceArchive = join(work, `postgresql-${runtimeLock.version}.tar.bz2`);
run('curl', ['--fail', '--location', '--silent', '--show-error', runtimeLock.source_url,
  '--output', sourceArchive]);
const sourceBytes = await readFile(sourceArchive);
if (sha256(sourceBytes) !== runtimeLock.source_sha256) {
  throw new Error('PostgreSQL 源码 SHA-256 与锁定值不一致');
}
const sourceRoot = join(work, 'source');
await mkdir(sourceRoot, { recursive: true });
run('tar', ['-xjf', sourceArchive, '-C', sourceRoot]);
const source = join(sourceRoot, `postgresql-${runtimeLock.version}`);
run(join(source, 'configure'), [
  `--prefix=${runtimeLock.install_prefix}`,
  ...runtimeLock.configure_options,
], { cwd: source });
run('make', [`-j${Math.max(1, availableParallelism())}`], { cwd: source });
const destination = join(work, 'postgresql-install');
run('make', ['install', `DESTDIR=${destination}`], { cwd: source });
const builtRuntime = join(destination, runtimeLock.install_prefix);
await cp(builtRuntime, join(stage, 'postgresql'), { recursive: true });
await cp(join(source, 'COPYRIGHT'), join(stage, 'share', 'licenses', 'PostgreSQL-COPYRIGHT'));
await writeFile(
  join(stage, 'share', 'postgresql.runtime.lock.json'),
  `${JSON.stringify(runtimeLock, null, 2)}\n`,
  { mode: 0o644 },
);

// 中文注释：安装包内两份 JavaScript bundle 的生产依赖许可证必须随包保存，不能只留依赖名称。
const npmTreeResult = spawnSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
  cwd: resolve('.'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
if (npmTreeResult.status !== 0) throw new Error(`生产依赖闭包读取失败: ${npmTreeResult.stderr}`);
const npmPackages = new Map();
function collectDependencies(dependencies = {}) {
  for (const [name, value] of Object.entries(dependencies)) {
    if (!npmPackages.has(name)) npmPackages.set(name, value.version);
    collectDependencies(value.dependencies);
  }
}
collectDependencies(JSON.parse(npmTreeResult.stdout).dependencies);
const npmLicenseDirectory = join(stage, 'share', 'licenses', 'npm');
await mkdir(npmLicenseDirectory, { recursive: true });
const npmNotices = [];
for (const [name, version] of [...npmPackages].sort(([left], [right]) => left.localeCompare(right))) {
  const packageRoot = resolve('node_modules', name);
  const document = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const licenseFiles = (await readdir(packageRoot))
    .filter((file) => /^(?:licen[cs]e|copying|copyright)(?:\.|$)/iu.test(file))
    .sort();
  const prefix = name.replace(/^@/u, '').replaceAll('/', '_');
  for (const file of licenseFiles) {
    await cp(join(packageRoot, file), join(npmLicenseDirectory, `${prefix}-${file}`));
  }
  npmNotices.push({ package: name, version, license: document.license ?? null, license_files: licenseFiles });
}
await writeFile(
  join(stage, 'share', 'licenses', 'npm-packages.json'),
  `${JSON.stringify(npmNotices, null, 2)}\n`,
  { mode: 0o644 },
);

for (const name of ['postgres', 'initdb', 'psql', 'createdb', 'pg_dump', 'pg_restore']) {
  const binary = join(stage, 'postgresql', 'bin', name);
  const identity = spawnSync('file', [binary], { encoding: 'utf8' });
  if (identity.status !== 0 || !/ELF 64-bit.*ARM aarch64/u.test(identity.stdout)) {
    throw new Error(`PostgreSQL ${name} 不是 Linux ARM64: ${identity.stdout}`);
  }
  const linkage = spawnSync('ldd', [binary], { encoding: 'utf8' });
  if (linkage.status !== 0 || /not found/u.test(linkage.stdout + linkage.stderr)
      || (linkage.stdout + linkage.stderr).includes(work)) {
    throw new Error(`PostgreSQL ${name} 动态链接不完整: ${linkage.stdout}${linkage.stderr}`);
  }
}

const esbuild = resolve('node_modules/esbuild/bin/esbuild');
run(esbuild, [
  'src/index.ts', '--bundle', '--platform=node', '--format=esm', '--target=node25',
  `--outfile=${join(stage, 'lib', 'worker.mjs')}`,
], { cwd: resolve('.') });
run(esbuild, [
  'linux/storage.mjs', '--bundle', '--platform=node', '--format=esm', '--target=node25',
  '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  `--outfile=${join(stage, 'lib', 'storage.mjs')}`,
], { cwd: resolve('.') });

await cp(resolve('linux/server.mjs'), join(stage, 'lib', 'server.mjs'));
await cp(resolve('linux/import.mjs'), join(stage, 'lib', 'import.mjs'));
await cp(resolve('schema.sql'), join(stage, 'share', 'schema.sql'));
const packageDocument = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
await writeFile(join(stage, 'share', 'release.json'), `${JSON.stringify({
  product_id: 'tuyuserve',
  platform: 'linux-arm64',
  software_version: packageDocument.version,
  postgresql_version: runtimeLock.version,
}, null, 2)}\n`, { mode: 0o644 });
await cp(resolve('linux/install.sh'), join(stage, 'install.sh'));
await cp(resolve('linux/uninstall.sh'), join(stage, 'uninstall.sh'));
await cp(resolve('linux/tuyuserve.service'), join(stage, 'system', 'tuyuserve.service'));
await cp(
  resolve('linux/tuyuserve-postgresql.service'),
  join(stage, 'system', 'tuyuserve-postgresql.service'),
);

const nodePrefix = dirname(dirname(process.execPath));
await cp(nodePrefix, join(stage, 'node'), { recursive: true });
const fileCheck = spawnSync('file', [join(stage, 'node', 'bin', 'node')], { encoding: 'utf8' });
if (fileCheck.status !== 0 || !/ELF 64-bit.*ARM aarch64/u.test(fileCheck.stdout)) {
  throw new Error(`内置 Node 不是 ARM64: ${fileCheck.stdout}`);
}
await mkdir(output, { recursive: true });
const artifact = join(output, 'tuyuserve-linux-arm64.tar.gz');
run('tar', ['-czf', artifact, '-C', work, 'tuyuserve']);
if ((await stat(artifact)).size === 0) throw new Error('TuyuServe Linux ARM64 安装包创建失败');
await rm(work, { recursive: true, force: true });
