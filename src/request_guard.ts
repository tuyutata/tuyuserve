import { ApiError } from './shared/api';
import { sha256Hex } from './shared/hash';
import { readMerchantRole } from './merchant/repository';
import type { Env, MerchantRole, SessionState, TuyuAudience } from './types';

export function assertSecureRequest(request: Request): void {
  const url = new URL(request.url);
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  if (url.protocol !== 'https:' || (forwardedProtocol && forwardedProtocol !== 'https')) {
    throw new ApiError(400, 'https_required', '只允许安全连接');
  }
}

export function assertSecurePublicUrl(value: string, websocket = false): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, 'invalid_secure_url', '安全地址格式不合法');
  }
  if (url.protocol !== (websocket ? 'wss:' : 'https:')) {
    throw new ApiError(400, 'secure_transport_required', '地址必须使用安全协议');
  }
  return url;
}

export async function requireSession(
  request: Request,
  env: Env,
  audience: TuyuAudience,
): Promise<SessionState> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError(401, 'missing_session', '登录会话缺失');
  }
  const tokenHash = await sha256Hex(authorization.slice('Bearer '.length));
  const session = await env.SESSION_CACHE.get<SessionState>(`tuyu_session:${tokenHash}`, 'json');
  if (!session || session.expires_at <= Date.now() || session.audience !== audience) {
    throw new ApiError(401, 'invalid_session', '登录会话无效');
  }
  return session;
}

export async function requireMerchantSession(
  request: Request,
  env: Env,
  merchantInstanceId: string,
  roles: MerchantRole[] = ['MERCHANT_OWNER', 'MERCHANT_ADMIN'],
): Promise<SessionState> {
  const session = await requireSession(request, env, 'tuyubooking');
  // 中文注释：商家授权属于商家模块，每次请求实时读取，绝不写入账户会话。
  const role = await readMerchantRole(env, merchantInstanceId, session.tuyu_id);
  if (role === null || !roles.includes(role)) {
    throw new ApiError(403, 'merchant_access_denied', '商家端管理员权限不足');
  }
  return session;
}
