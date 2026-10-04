#!/usr/bin/env node
// CI_BUILD: incremental

import { execFileSync } from 'node:child_process';

function run(args) {
  execFileSync('npm', args, { cwd: 'tuyuserve', stdio: 'inherit', env: process.env });
}

try {
  run(['ci']);
  run(['test']);
  run(['run', 'typecheck']);
} catch (error) {
  console.error(`途遇 Cloudflare CI 失败：${error.message}`);
  process.exitCode = 1;
}
