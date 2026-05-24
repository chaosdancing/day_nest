import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { FakeWechatClient } from '../helpers/wechat.fake.js';
import { signBindToken } from '../../src/auth/bindToken.js';
import { hashPassword } from '../../src/auth/password.js';
import { loadConfig } from '../../src/config.js';

describe('POST /api/auth/wechat-bind', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let wechat: FakeWechatClient;

  beforeEach(async () => {
    wechat = new FakeWechatClient();
    ctx = await buildApp({ wechat });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function makeUser(opts: { username: string; password: string; wechatOpenId?: string | null }) {
    const hash = await hashPassword(opts.password);
    return ctx.prisma.user.create({
      data: {
        username: opts.username,
        displayName: opts.username,
        passwordHash: hash,
        wechatOpenId: opts.wechatOpenId ?? null,
        wechatBoundAt: opts.wechatOpenId ? new Date() : null,
      },
    });
  }

  it('binds an unbound user and issues tokens', async () => {
    const user = await makeUser({ username: 'alice', password: 'alicepw123' });
    const bt = await signBindToken({ openid: 'wxid-1' }, loadConfig().jwt.secret);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: bt, username: 'alice', password: 'alicepw123' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      user: { id: string; username: string; hasWechatBound: boolean };
      accessToken: string;
      refreshToken: string;
    };
    expect(body.user.id).toBe(user.id);
    expect(body.user.username).toBe('alice');
    expect(body.user.hasWechatBound).toBe(true);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const cookie = res.headers['set-cookie'];
    expect(cookie).toBeTruthy();
    const cookieStr = Array.isArray(cookie) ? cookie.join(';') : (cookie as string);
    expect(cookieStr).toContain('daynest_rt=');

    const after = await ctx.prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.wechatOpenId).toBe('wxid-1');
    expect(after?.wechatBoundAt).toBeTruthy();
  });

  it('returns 400 BIND_TOKEN_INVALID for tampered token', async () => {
    await makeUser({ username: 'alice', password: 'alicepw123' });
    const bt = await signBindToken({ openid: 'wxid-1' }, loadConfig().jwt.secret);
    const tampered = bt.slice(0, -4) + 'AAAA';

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: tampered, username: 'alice', password: 'alicepw123' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'BIND_TOKEN_INVALID' });
  });

  it('returns 400 BIND_TOKEN_INVALID for expired token', async () => {
    await makeUser({ username: 'alice', password: 'alicepw123' });
    const bt = await signBindToken({ openid: 'wxid-1' }, loadConfig().jwt.secret, 0);
    await new Promise((r) => setTimeout(r, 1100));

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: bt, username: 'alice', password: 'alicepw123' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'BIND_TOKEN_INVALID' });
  });

  it('returns 401 CREDENTIALS_INVALID for unknown username', async () => {
    const bt = await signBindToken({ openid: 'wxid-1' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: bt, username: 'nobody', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'CREDENTIALS_INVALID' });
  });

  it('returns 401 CREDENTIALS_INVALID for wrong password', async () => {
    await makeUser({ username: 'alice', password: 'alicepw123' });
    const bt = await signBindToken({ openid: 'wxid-1' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: bt, username: 'alice', password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'CREDENTIALS_INVALID' });
  });

  it('returns 409 USER_ALREADY_BOUND when user already has a wechatOpenId', async () => {
    await makeUser({ username: 'alice', password: 'alicepw123', wechatOpenId: 'existing-openid' });
    const bt = await signBindToken({ openid: 'new-openid' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: bt, username: 'alice', password: 'alicepw123' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'USER_ALREADY_BOUND' });
  });

  it('returns 409 WECHAT_ALREADY_BOUND when openid is bound to a different user', async () => {
    await makeUser({ username: 'alice', password: 'alicepw123' });
    await makeUser({ username: 'bob', password: 'bobpw123', wechatOpenId: 'wxid-shared' });
    const bt = await signBindToken({ openid: 'wxid-shared' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: bt, username: 'alice', password: 'alicepw123' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'WECHAT_ALREADY_BOUND' });
  });

  it('returns 400 VALIDATION_ERROR for missing fields', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { username: 'alice' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
