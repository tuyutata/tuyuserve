#!/usr/bin/env node
import { spawnSync as runExactProcess } from 'node:child_process';
function validateCandidate(){const value=process.env;
if(!/^[0-9a-f]{40}$/.test(value.SOURCE_SHA||'')||!/^[1-9][0-9]*$/.test(value.CI_RUN_ID||'')||!/^\d+\.\d{1,2}\.\d{1,2}$/.test(value.SOFTWARE_VERSION||'')||value.VERSION_TAG!=='tuyuserve-linux-arm-v'+value.SOFTWARE_VERSION)throw Error('准确Release候选无效');}

// 本文件只执行 tuyuserve.linux-arm.release 的 linux-arm64 Job；阶段编号由本仓唯一 Workflow 固定，禁止接收其它身份。
export const EXACT_REMOTE_JOB_IDENTITY=Object.freeze({"pipeline":"tuyuserve.linux-arm.release","job":"linux-arm64"});

function requireExactRemoteJobEnvironment() {
  const expected = 'tuyutata/tuyuserve';
  if (!expected || process.env.GITHUB_REPOSITORY !== expected) {
    throw new Error('准确远端Job仓库身份无效');
  }
}
const workflowSteps=Object.freeze({"0":{"shell":"bash","source":"sudo apt-get update && sudo apt-get install -y file openssl curl"},"1":{"shell":"bash","source":"node \"$GITHUB_WORKSPACE/scripts/release/linux-arm/linux-arm64/execute.mjs\" validate-inputs"},"2":{"shell":"bash","source":"node $GITHUB_WORKSPACE/scripts/release/linux-arm/index.mjs build-release"},"3":{"shell":"bash","source":"node $GITHUB_WORKSPACE/scripts/release/linux-arm/index.mjs publish-release"}});
function runExactWorkflowStep(index){requireExactRemoteJobEnvironment();if(!/^(?:0|[1-9][0-9]*)$/.test(String(index||''))||!Object.hasOwn(workflowSteps,String(index)))throw new Error('准确远端Job阶段无效');const step=workflowSteps[String(index)];const command=step.shell==='pwsh'?'pwsh':(process.platform==='win32'?'bash':'/bin/bash');const args=step.shell==='pwsh'?['-NoLogo','-NoProfile','-NonInteractive','-Command',step.source]:['--noprofile','--norc','-e','-o','pipefail','-c',step.source];const result=runExactProcess(command,args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});if(result.error)throw new Error('准确远端Job阶段无法启动');if(result.status!==0)process.exitCode=Number.isInteger(result.status)?result.status:1;}

requireExactRemoteJobEnvironment();
validateCandidate();
if(process.argv[2]==='validate-inputs') process.exit(0);
if(process.argv[2]!=='workflow-step')throw new Error('准确Release Job只接受workflow-step');
runExactWorkflowStep(process.argv[3]);
