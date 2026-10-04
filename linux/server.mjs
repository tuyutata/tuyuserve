import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from './worker.mjs';
import { openStorage } from './storage.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const home = process.env.TUYUSERVE_HOME ?? dirname(directory);
const dataDirectory = process.env.TUYUSERVE_DATA ?? '/var/lib/tuyuserve';
const certificateFile = process.env.TUYUSERVE_TLS_CERT;
const keyFile = process.env.TUYUSERVE_TLS_KEY;
const host = process.env.TUYUSERVE_HOST ?? '0.0.0.0';
const port = Number(process.env.TUYUSERVE_PORT ?? '8443');

if (process.platform !== 'linux' || process.arch !== 'arm64' || !certificateFile || !keyFile
    || !Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error('TuyuServe Linux 只允许 ARM64，并且必须配置有效 TLS 证书、私钥和端口');
}

const storage = await openStorage({
  dataDirectory,
  schemaFile: join(home, 'share', 'schema.sql'),
});
const env = {
  ...storage,
  CHALLENGE_TTL_SECONDS: process.env.TUYUSERVE_CHALLENGE_TTL ?? '300',
  SESSION_TTL_SECONDS: process.env.TUYUSERVE_SESSION_TTL ?? '28800',
};

const server = createServer({
  cert: await readFile(certificateFile),
  key: await readFile(keyFile),
}, async (incoming, outgoing) => {
  try {
    const authority = incoming.headers.host;
    if (!authority) throw new Error('Host 请求头缺失');
    const body = ['GET', 'HEAD'].includes(incoming.method ?? '')
      ? undefined
      : Readable.toWeb(incoming);
    const request = new Request(`https://${authority}${incoming.url ?? '/'}`, {
      method: incoming.method,
      headers: incoming.headers,
      body,
      ...(body ? { duplex: 'half' } : {}),
    });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (!response.body) return outgoing.end();
    Readable.fromWeb(response.body).pipe(outgoing);
  } catch {
    outgoing.writeHead(500, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    outgoing.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
});

server.listen(port, host);

function shutdown() {
  server.close(async () => {
    // 中文注释：先停止接收请求，再等待 PostgreSQL 连接池完全关闭后退出。
    await storage.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
