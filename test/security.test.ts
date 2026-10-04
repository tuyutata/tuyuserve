import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { assertSecurePublicUrl } from '../src/request_guard';
import { createTestEnv, responseJson } from './support';

describe('安全传输', () => {
  it('拒绝非安全请求并返回 HSTS', async () => {
    const { env } = createTestEnv();
    const response = await worker.fetch(new Request('http://worker.test/v1/health'), env);
    expect(response.status).toBe(400);
    expect(response.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect((await responseJson(response)).error).toBe('https_required');
  });

  it('接受安全请求', async () => {
    const { env } = createTestEnv();
    const response = await worker.fetch(new Request('https://worker.test/v1/health'), env);
    expect(response.status).toBe(200);
  });

  it('公网 API 和实时地址只接受安全协议', () => {
    expect(assertSecurePublicUrl('https://merchant.example')).toBeInstanceOf(URL);
    expect(assertSecurePublicUrl('wss://chat.example', true)).toBeInstanceOf(URL);
    expect(() => assertSecurePublicUrl('http://merchant.example')).toThrow();
    expect(() => assertSecurePublicUrl('ws://chat.example', true)).toThrow();
  });

  it('手机号和邮箱不存在独立登录入口', async () => {
    const { env } = createTestEnv();
    const response = await worker.fetch(new Request('https://worker.test/v1/auth/phone-login', {
      method: 'POST',
      body: '{}',
    }), env);
    expect(response.status).toBe(404);
  });
});
