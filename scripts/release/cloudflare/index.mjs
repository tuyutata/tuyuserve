#!/usr/bin/env node
import { remoteEnvironment as productRemoteEnvironment } from '../../build.mjs';
if(process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('tuyuserve.'))Object.assign(process.env,productRemoteEnvironment());
// RELEASE_BUILD: full; CARGO_INCREMENTAL=0
// 当前入口按产品与平台验真 CI 来源，并创建对应的 GitHub Release 资产。

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const identity = Object.freeze({ product: "tuyuserve", platform: "cloudflare", prefix: "tuyuserve-cloudflare-v", ciTitle: "途遇服务端 · Cloudflare · CI", workflow: "tuyuserve.cloudflare.release", asset: "tuyuserve-cloudflare.tgz" });
const output = join(process.env.RUNNER_TEMP || "/tmp", "tuyuserve-release");
function required(value, message) { if (!value) throw new Error(message); }
function run(file, args, cwd = process.cwd()) { execFileSync(file, args, { cwd, stdio: "inherit", env: process.env }); }
function githubJSON(args) { return JSON.parse(execFileSync("gh", args, { encoding: "utf8", env: process.env })); }
function hash(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function parseVersion(value) { const match = /^(0|[1-9]\d*)\.(0|[1-9]\d{0,1})\.(0|[1-9]\d{0,1})$/.exec(value || ""); required(match, `Cloudflare 软件版本无效：${value || "(empty)"}`); return match.slice(1).map(Number); }
function baseInputs() { const value = { repository: process.env.GITHUB_REPOSITORY, source: process.env.SOURCE_SHA, ciRunID: process.env.CI_RUN_ID }; required(value.repository === "tuyutata/tuyuserve", "途遇服务仓库身份无效"); required(/^[0-9a-f]{40}$/.test(value.source || ""), "Cloudflare Release 源提交无效"); required(/^[1-9][0-9]*$/.test(value.ciRunID || ""), "Cloudflare CI Run ID 无效"); return value; }
function inputs() { const value = { ...baseInputs(), version: process.env.SOFTWARE_VERSION, tag: process.env.VERSION_TAG }; parseVersion(value.version); required(value.tag === `${identity.prefix}${value.version}`, "Cloudflare Tag 无效"); return value; }
function verify(value) {
  required(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() === value.source, "Cloudflare 源码提交不一致"); const runInfo = githubJSON(["api", `repos/${value.repository}/actions/runs/${value.ciRunID}`]);
  required(String(runInfo?.id) === value.ciRunID && runInfo?.head_sha === value.source && runInfo?.head_branch === "main" && runInfo?.event === "workflow_dispatch" && runInfo?.status === "completed" && runInfo?.conclusion === "success" && String(runInfo?.display_title || '') === identity.ciTitle && String(runInfo?.path || "").endsWith("/tuyuserve-cloudflare-ci.yml"), "Cloudflare CI Run 身份不一致");
}
function applyVersion(version) { for (const path of ["tuyuserve/package.json", "tuyuserve/package-lock.json"]) { const value = JSON.parse(readFileSync(path, "utf8")); value.version = version; if (path.endsWith("package-lock.json")) { required(value.packages?.[""], "TuyuServe package-lock 根包缺失"); value.packages[""].version = version; } writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); } }
function context(value) { writeFileSync("release-context.json", `${JSON.stringify({ repository: value.repository, product_id: identity.product, platform: identity.platform, software_flow: "release", software_version: value.version, version_tag: value.tag, source_sha: value.source, ci_run_id: Number(value.ciRunID), workflow: identity.workflow }, null, 2)}\n`); }
function build(value) {
  rmSync(output, { recursive: true, force: true }); mkdirSync(join(output, "bundle"), { recursive: true }); applyVersion(value.version);
  run("npm", ["ci"], "tuyuserve"); run("npm", ["test"], "tuyuserve"); run("npm", ["run", "typecheck"], "tuyuserve"); run("npx", ["wrangler", "deploy", "--dry-run", "--outdir", join(output, "bundle")], "tuyuserve");
  run("tar", ["--sort=name", "--mtime=UTC 1970-01-01", "--owner=0", "--group=0", "--numeric-owner", "-C", join(output, "bundle"), "-czf", join(output, identity.asset), "."]);
  const asset = join(output, identity.asset); required(existsSync(asset), "TuyuServe 正式归档不存在");
  const manifest = join(output, "release-manifest.json"); writeFileSync(manifest, `${JSON.stringify({ product_id: identity.product, platform: identity.platform, software_version: value.version, git_commit_sha: value.source, ci_run_id: Number(value.ciRunID), assets: [{ name: identity.asset, sha256: hash(asset) }] }, null, 2)}\n`);
  writeFileSync(join(output, "SHA256SUMS"), `${hash(asset)}  ${identity.asset}\n${hash(manifest)}  release-manifest.json\n`);
}
function publish(value) { const assets = [identity.asset, "release-manifest.json", "SHA256SUMS"].map((name) => join(output, name)); assets.forEach((path) => required(existsSync(path), `Cloudflare Release 资产缺失：${path}`)); required(spawnSync("gh", ["release", "view", value.tag, "--repo", value.repository], { stdio: "ignore" }).status !== 0, "Cloudflare 正式 Release 已存在，禁止覆盖"); required(spawnSync("gh", ["api", `repos/${value.repository}/git/ref/tags/${value.tag}`], { stdio: "ignore" }).status !== 0, "Cloudflare 正式 Tag 已存在，禁止覆盖"); run("gh", ["release", "create", value.tag, ...assets, "--repo", value.repository, "--title", "途遇服务端 · Release · Cloudflare", "--notes", `途遇服务端 ${value.version}；SOURCE_SHA:${value.source}`, "--latest=false"]); }
try { const command = process.argv[2]; const value = inputs(); if (command === "verify-release-source") verify(value); else if (command === "write-context") context(value); else if (command === "build-release") build(value); else if (command === "publish-release") publish(value); else throw new Error(`Cloudflare Release 子命令未登记：${command || "(empty)"}`); } catch (error) { console.error(error.message); process.exitCode = 1; }
