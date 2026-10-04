import type { Env } from './types';

const DOWNLOAD_ORIGIN = 'https://download.tuyulove.com';
const products = {
  tuyubooking: {
    macos: { asset: 'tuyubooking-macos.zip', contentType: 'application/zip' },
    linux: {
      asset: 'tuyubooking-linux.deb',
      contentType: 'application/vnd.debian.binary-package',
    },
    windows: { asset: 'tuyubooking-windows.zip', contentType: 'application/zip' },
  },
  tuyufactory: {
    macos: { asset: 'tuyufactory-macos.zip', contentType: 'application/zip' },
    linux: { asset: 'tuyufactory-linux.tar.gz', contentType: 'application/gzip' },
    windows: { asset: 'tuyufactory-windows.zip', contentType: 'application/zip' },
  },
} as const;
export type DownloadProduct = keyof typeof products;
type Platform = keyof typeof products.tuyubooking;
type Installer = { readonly asset: string; readonly contentType: string };

function parsePlatform(value: string): Platform | null {
  return Object.hasOwn(products.tuyubooking, value) ? value as Platform : null;
}

function objectHeaders(object: R2Object, installer: Installer): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', installer.contentType);
  headers.set('Content-Disposition', `attachment; filename="${installer.asset}"`);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return headers;
}

/** Cloudflare 的 R2Range 是三分支联合类型；统一解析后才能安全生成标准范围响应头。 */
function resolvedRange(range: R2Range, size: number): { offset: number; length: number } | null {
  let offset: number;
  let length: number;
  if ('suffix' in range) {
    if (!Number.isSafeInteger(range.suffix) || range.suffix <= 0) return null;
    length = Math.min(range.suffix, size);
    offset = size - length;
  } else {
    offset = range.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) return null;
    const available = size - offset;
    length = Math.min(range.length ?? available, available);
  }
  if (!Number.isSafeInteger(length) || length <= 0) return null;
  return { offset, length };
}

/** D1 只保存当前公开版本指针，安装包正文不进入关系数据库。 */
export async function installerRedirect(
  env: Env, productID: DownloadProduct, value: string,
): Promise<Response> {
  const platform = parsePlatform(value);
  if (platform === null) return new Response('Not found', { status: 404 });
  const installer: Installer = products[productID][platform];
  const row = await env.DB.prepare(
    'SELECT version_tag FROM software_releases WHERE product_id = ? AND platform = ? LIMIT 1',
  ).bind(productID, platform).first<{ version_tag: string }>();
  if (row === null || row.version_tag.length === 0) {
    return new Response('Release not published', { status: 404 });
  }
  const namespace = productID === 'tuyubooking' ? '' : `/${productID}`;
  const location = `${DOWNLOAD_ORIGIN}/files${namespace}/${platform}/${encodeURIComponent(row.version_tag)}/${installer.asset}`;
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
}

/** 固定平台、版本和资产名后流式读取 R2，禁止任意对象键访问。 */
export async function installerDownload(request: Request, env: Env, path: string[]): Promise<Response> {
  if (path[0] !== 'files') return new Response('Not found', { status: 404 });
  const productID: DownloadProduct = path[1] === 'tuyufactory' ? 'tuyufactory' : 'tuyubooking';
  const offset = productID === 'tuyubooking' ? 1 : 2;
  if (path.length !== offset + 3) return new Response('Not found', { status: 404 });
  const platform = parsePlatform(path[offset]);
  if (platform === null) return new Response('Not found', { status: 404 });
  const installer: Installer = products[productID][platform];
  if (path[offset + 2] !== installer.asset) {
    return new Response('Not found', { status: 404 });
  }
  const versionTag = decodeURIComponent(path[offset + 1]);
  const versionPattern = new RegExp(
    `^${productID}-${platform}-v[0-9]+\\.[0-9]+\\.[0-9]+$`, 'u',
  );
  if (!versionPattern.test(versionTag)) {
    return new Response('Not found', { status: 404 });
  }
  const key = `${productID}/${platform}/${versionTag}/${installer.asset}`;
  if (request.method === 'HEAD') {
    const object = await env.DOWNLOADS.head(key);
    if (object === null) return new Response('Not found', { status: 404 });
    const headers = objectHeaders(object, installer);
    headers.set('Content-Length', String(object.size));
    return new Response(null, { status: 200, headers });
  }
  const object = await env.DOWNLOADS.get(key, { range: request.headers });
  if (object === null) return new Response('Not found', { status: 404 });
  const headers = objectHeaders(object, installer);
  if (object.range === undefined) {
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  }
  const range = resolvedRange(object.range, object.size);
  if (range === null) {
    headers.set('Content-Range', `bytes */${object.size}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  const end = range.offset + range.length - 1;
  headers.set('Content-Range', `bytes ${range.offset}-${end}/${object.size}`);
  headers.set('Content-Length', String(range.length));
  return new Response(object.body, { status: 206, headers });
}
