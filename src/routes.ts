import { createLoginChallenge, createSession, logout } from '../account/cloud/service';
import { catalogListing, discoverListings, publishListing } from './catalog/service';
import {
  grantMerchantAdministrator,
  registerMerchantInstance,
  revokeMerchantAdministrator,
} from './merchant/service';
import { ApiError, jsonResponse } from './shared/api';
import { installerDownload, installerRedirect } from './download';
import { createTrip, publicTrips } from './social/service';
import type { Env } from './types';

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const downloadPath = url.pathname.split('/').filter(Boolean);
  if ((request.method === 'GET' || request.method === 'HEAD')
      && downloadPath.length === 1
      && ['macos', 'linux', 'windows'].includes(downloadPath[0])) {
    return installerRedirect(env, 'tuyubooking', downloadPath[0]);
  }
  if ((request.method === 'GET' || request.method === 'HEAD')
      && downloadPath.length === 2
      && downloadPath[0] === 'tuyufactory'
      && ['macos', 'linux', 'windows'].includes(downloadPath[1])) {
    return installerRedirect(env, 'tuyufactory', downloadPath[1]);
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && downloadPath[0] === 'files') {
    return installerDownload(request, env, downloadPath);
  }
  if (request.method === 'POST' && url.pathname === '/v1/auth/challenge') {
    return createLoginChallenge(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/v1/auth/session') {
    return createSession(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
    return logout(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/v1/merchant-instances/register') {
    return registerMerchantInstance(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/v1/merchant-instances/grants') {
    return grantMerchantAdministrator(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/v1/merchant-instances/grants/revoke') {
    return revokeMerchantAdministrator(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/v1/catalog') {
    return discoverListings(request, env);
  }
  const catalogMatch = /^\/v1\/catalog\/(tli_[0-9a-f]{32})$/u.exec(url.pathname);
  if (catalogMatch && request.method === 'GET') {
    return catalogListing(env, catalogMatch[1]);
  }
  if (catalogMatch && request.method === 'PUT') {
    return publishListing(request, env, catalogMatch[1]);
  }
  if (request.method === 'GET' && url.pathname === '/v1/trips') {
    return publicTrips(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/v1/trips') {
    return createTrip(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/v1/health') {
    return jsonResponse({ ok: true, service: 'tuyuserve' });
  }
  throw new ApiError(404, 'not_found', '接口不存在');
}
