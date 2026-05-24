import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { createApiClient, type TokenProvider } from '../../miniprogram/lib/api.js';

function tokens(initial = { access: 'a1', refresh: 'r1' }): TokenProvider {
  let access = initial.access;
  let refresh = initial.refresh;
  let cleared = false;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: (a, r) => { access = a; refresh = r; },
    clearTokens: () => { cleared = true; access = ''; refresh = ''; },
    isCleared: () => cleared,
  } as TokenProvider & { isCleared: () => boolean };
}

describe('api client', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('attaches Authorization Bearer header from TokenProvider', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(mock.requests[0]?.header?.Authorization).toBe('Bearer a1');
  });

  it('omits Authorization header when no access token', async () => {
    const tp = tokens({ access: '', refresh: '' });
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(mock.requests[0]?.header?.Authorization).toBeUndefined();
  });

  it('on 401, refreshes once and retries the original request', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: { error: 'expired' } });
    mock.queueResponse({ statusCode: 200, data: { accessToken: 'a2', refreshToken: 'r2' } });
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    const res = await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(res.statusCode).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(mock.requests.length).toBe(3);
    expect(mock.requests[1]?.url).toBe('https://x/refresh');
    expect(mock.requests[2]?.header?.Authorization).toBe('Bearer a2');
    expect(tp.getAccessToken()).toBe('a2');
  });

  it('on refresh failure, clears tokens and surfaces 401', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: { error: 'expired' } });
    mock.queueResponse({ statusCode: 401, data: { error: 'BAD_REFRESH' } });
    const res = await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(res.statusCode).toBe(401);
    expect((tp as unknown as { isCleared: () => boolean }).isCleared()).toBe(true);
  });

  it('coalesces concurrent 401s into a single refresh', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: {} });
    mock.queueResponse({ statusCode: 401, data: {} });
    mock.queueResponse({ statusCode: 200, data: { accessToken: 'a2', refreshToken: 'r2' } });
    mock.queueResponse({ statusCode: 200, data: { which: 'first' } });
    mock.queueResponse({ statusCode: 200, data: { which: 'second' } });
    const [r1, r2] = await Promise.all([
      api.request({ url: 'https://x/foo', method: 'GET' }),
      api.request({ url: 'https://x/bar', method: 'GET' }),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const refreshes = mock.requests.filter((r) => r.url === 'https://x/refresh');
    expect(refreshes.length).toBe(1);
  });

  it('does NOT retry the refresh URL itself on 401', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: { error: 'BAD_REFRESH' } });
    const res = await api.request({ url: 'https://x/refresh', method: 'POST', data: {} });
    expect(res.statusCode).toBe(401);
    expect(mock.requests.length).toBe(1);
  });
});
