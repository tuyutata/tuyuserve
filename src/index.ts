import { route } from './routes';
import { ApiError, jsonResponse } from './shared/api';
import { assertSecureRequest } from './request_guard';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      assertSecureRequest(request);
      return await route(request, env);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
      }
      return jsonResponse({ ok: false, error: 'internal_error', message: '服务暂时不可用' }, 500);
    }
  },
};
