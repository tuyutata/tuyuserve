import { describe, expect, it } from 'vitest';
import { installerDownload, installerRedirect } from '../src/download';
import { createTestEnv } from './support';

function rangedObject(range: R2Range, body: string): R2ObjectBody {
  return {
    key: 'tuyubooking/macos/tuyubooking-macos-v1.0.0/tuyubooking-macos.zip',
    version: 'test-version',
    size: 10,
    etag: 'test-etag',
    httpEtag: '"test-etag"',
    checksums: {} as R2Checksums,
    uploaded: new Date(0),
    range,
    storageClass: 'Standard',
    writeHttpMetadata: () => {},
    body: new Blob([body]).stream(),
    bodyUsed: false,
  } as unknown as R2ObjectBody;
}

function downloadEnv(range: R2Range, body: string): ReturnType<typeof createTestEnv>['env'] {
  const { env } = createTestEnv();
  env.DOWNLOADS = {
    get: async () => rangedObject(range, body),
  } as unknown as R2Bucket;
  return env;
}

describe('途遇商家端公开下载', () => {
  it('按 D1 当前指针跳转到准确安装包', async () => {
    const { db, env } = createTestEnv();
    db.releases.set('tuyubooking:macos', 'tuyubooking-macos-v1.0.0');
    const response = await installerRedirect(env, 'tuyubooking', 'macos');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://download.tuyulove.com/files/macos/tuyubooking-macos-v1.0.0/tuyubooking-macos.zip',
    );
  });

  it('没有 D1 当前指针时不展示安装包', async () => {
    const { env } = createTestEnv();
    expect((await installerRedirect(env, 'tuyubooking', 'linux')).status).toBe(404);
  });

  it('厂家端使用独立产品指针和下载命名空间', async () => {
    const { db, env } = createTestEnv();
    db.releases.set('tuyufactory:linux', 'tuyufactory-linux-v1.0.0');
    const response = await installerRedirect(env, 'tuyufactory', 'linux');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://download.tuyulove.com/files/tuyufactory/linux/tuyufactory-linux-v1.0.0/tuyufactory-linux.tar.gz',
    );
  });

  it('商家端 Linux 公开资产固定为 ARM64 Debian 包', async () => {
    const { db, env } = createTestEnv();
    db.releases.set('tuyubooking:linux', 'tuyubooking-linux-v1.0.0');
    const response = await installerRedirect(env, 'tuyubooking', 'linux');
    expect(response.headers.get('Location')).toBe(
      'https://download.tuyulove.com/files/linux/tuyubooking-linux-v1.0.0/tuyubooking-linux.deb',
    );
  });

  it('拒绝非固定平台资产', async () => {
    const { env } = createTestEnv();
    const request = new Request(
      'https://download.tuyulove.com/files/windows/tuyubooking-windows-v1.0.0/other.zip',
    );
    expect((await installerDownload(request, env, [
      'files', 'windows', 'tuyubooking-windows-v1.0.0', 'other.zip',
    ])).status).toBe(404);
  });

  it.each([
    [{ offset: 2 }, '23456789', 'bytes 2-9/10', '8'],
    [{ length: 4 }, '0123', 'bytes 0-3/10', '4'],
    [{ suffix: 3 }, '789', 'bytes 7-9/10', '3'],
  ] as const)('正确处理 R2 Range 联合类型 %j', async (range, body, contentRange, contentLength) => {
    const request = new Request(
      'https://download.tuyulove.com/files/macos/tuyubooking-macos-v1.0.0/tuyubooking-macos.zip',
      { headers: { Range: 'bytes=0-1' } },
    );
    const response = await installerDownload(request, downloadEnv(range, body), [
      'files', 'macos', 'tuyubooking-macos-v1.0.0', 'tuyubooking-macos.zip',
    ]);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(contentRange);
    expect(response.headers.get('Content-Length')).toBe(contentLength);
    expect(await response.text()).toBe(body);
  });

  it('拒绝用商家端路径读取厂家端资产', async () => {
    const { env } = createTestEnv();
    const request = new Request(
      'https://download.tuyulove.com/files/linux/tuyufactory-linux-v1.0.0/tuyufactory-linux.tar.gz',
    );
    expect((await installerDownload(request, env, [
      'files', 'linux', 'tuyufactory-linux-v1.0.0', 'tuyufactory-linux.tar.gz',
    ])).status).toBe(404);
  });
});
