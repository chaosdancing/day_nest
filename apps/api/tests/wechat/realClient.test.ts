import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { RealWechatClient } from '../../src/wechat/realClient.js';
import { WechatApiError } from '../../src/wechat/client.js';
import { AccessTokenCache } from '../../src/wechat/accessTokenCache.js';

type FetchLike = typeof globalThis.fetch;
type FetchMock = Mock<Parameters<FetchLike>, ReturnType<FetchLike>>;

function mockResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RealWechatClient.jsCode2Session', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn() as FetchMock;
  });

  it('returns openid + sessionKey on success', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ openid: 'open-abc', session_key: 'sk-xyz' }),
    );
    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    const res = await client.jsCode2Session('valid-code');
    expect(res.openid).toBe('open-abc');
    expect(res.sessionKey).toBe('sk-xyz');
    expect(res.unionid).toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const url = firstCall![0] as string;
    expect(url).toContain('jscode2session');
    expect(url).toContain('appid=wxapp');
    expect(url).toContain('secret=wxsecret');
    expect(url).toContain('js_code=valid-code');
    expect(url).toContain('grant_type=authorization_code');
  });

  it('exposes unionid when present', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ openid: 'open-abc', session_key: 'sk', unionid: 'union-xyz' }),
    );
    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    const res = await client.jsCode2Session('valid-code');
    expect(res.unionid).toBe('union-xyz');
  });

  it('throws WechatApiError(40029) when WX returns an errcode', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ errcode: 40029, errmsg: 'invalid code' }),
    );
    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    await expect(client.jsCode2Session('bad')).rejects.toMatchObject({
      name: 'WechatApiError',
      errcode: 40029,
    });
  });

  it('throws on HTTP non-200', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    await expect(client.jsCode2Session('any')).rejects.toThrow();
  });

  it('throws on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('econnreset'));
    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    await expect(client.jsCode2Session('any')).rejects.toThrow();
  });
});

describe('RealWechatClient.getAccessToken', () => {
  it('fetches token from WX and caches it', async () => {
    const fetchMock = vi.fn() as FetchMock;
    fetchMock.mockResolvedValue(mockResponse({ access_token: 'at-1', expires_in: 7200 }));
    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    const r1 = await client.getAccessToken();
    expect(r1.accessToken).toBe('at-1');
    expect(r1.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 7000);

    const r2 = await client.getAccessToken();
    expect(r2.accessToken).toBe('at-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws WechatApiError when WX returns an errcode', async () => {
    const fetchMock = vi.fn() as FetchMock;
    fetchMock.mockResolvedValue(
      mockResponse({ errcode: 40013, errmsg: 'invalid appid' }),
    );
    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    await expect(client.getAccessToken()).rejects.toMatchObject({
      name: 'WechatApiError',
      errcode: 40013,
    });
  });
});

describe('RealWechatClient.sendSubscribeMessage', () => {
  it('sends a POST with access_token in query and returns ok:true on errcode 0', async () => {
    const fetchMock = vi.fn() as FetchMock;
    fetchMock.mockResolvedValueOnce(mockResponse({ access_token: 'at-1', expires_in: 7200 }));
    fetchMock.mockResolvedValueOnce(mockResponse({ errcode: 0, errmsg: 'ok' }));

    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });

    const outcome = await client.sendSubscribeMessage({
      toUser: 'openid-xyz',
      templateId: 'tmpl-1',
      data: { name: { value: 'photo' } },
    });

    expect(outcome).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall).toBeDefined();
    const [sendUrl, sendInit] = secondCall!;
    expect(sendUrl).toContain('message/subscribe/send');
    expect(sendUrl).toContain('access_token=at-1');
    expect(sendInit?.method).toBe('POST');
    const sentBody = JSON.parse((sendInit as RequestInit).body as string);
    expect(sentBody.touser).toBe('openid-xyz');
    expect(sentBody.template_id).toBe('tmpl-1');
    expect(sentBody.data).toEqual({ name: { value: 'photo' } });
  });

  it('returns ok:false with errcode on WX failure', async () => {
    const fetchMock = vi.fn() as FetchMock;
    fetchMock.mockResolvedValueOnce(mockResponse({ access_token: 'at-1', expires_in: 7200 }));
    fetchMock.mockResolvedValueOnce(mockResponse({ errcode: 43101, errmsg: 'user rejected' }));

    const client = new RealWechatClient({
      appId: 'wxapp',
      appSecret: 'wxsecret',
      cache: new AccessTokenCache(),
      fetch: fetchMock,
    });
    const outcome = await client.sendSubscribeMessage({
      toUser: 'open-x',
      templateId: 't',
      data: {},
    });
    expect(outcome).toEqual({ ok: false, errcode: 43101, errmsg: 'user rejected' });
  });
});
