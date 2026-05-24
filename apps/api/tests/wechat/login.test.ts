import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { FakeWechatClient } from '../helpers/wechat.fake.js';
import { verifyBindToken } from '../../src/auth/bindToken.js';
import { loadConfig } from '../../src/config.js';

describe('POST /api/auth/wechat-login', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let wechat: FakeWechatClient;

  beforeEach(async () => {
    wechat = new FakeWechatClient();
    ctx = await buildApp({ wechat });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('returns status:unbound + bindToken when openid has no bound user', async () => {
    wechat.setCode('wxcode-1', 'openid-new');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'wxcode-1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; bindToken: string };
    expect(body.status).toBe('unbound');
    expect(body.bindToken).toBeTruthy();
    const claims = await verifyBindToken(body.bindToken, loadConfig().jwt.secret);
    expect(claims.openid).toBe('openid-new');
  });

  it('returns status:bound + tokens when openid is bound', async () => {
    const user = await ctx.prisma.user.create({
      data: {
        username: 'bobby',
        displayName: 'Bobby',
        passwordHash: 'fake',
        wechatOpenId: 'openid-bound',
        wechatBoundAt: new Date(),
      },
    });
    wechat.setCode('wxcode-2', 'openid-bound');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'wxcode-2' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      user: { id: string; hasWechatBound: boolean };
      accessToken: string;
      refreshToken: string;
    };
    expect(body.status).toBe('bound');
    expect(body.user.id).toBe(user.id);
    expect(body.user.hasWechatBound).toBe(true);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    // Refresh token should ALSO be set as cookie (matching web behavior)
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie as string);
    expect(cookieStr).toContain('daynest_rt=');
  });

  it('returns 400 WECHAT_CODE_INVALID when code is rejected by WX', async () => {
    // Don't register 'bad-code' in fake — jsCode2Session will throw WechatApiError(40029)
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'bad-code' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'WECHAT_CODE_INVALID' });
  });

  it('returns 400 VALIDATION_ERROR when code missing', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
