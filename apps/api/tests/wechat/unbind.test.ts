import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signAccess } from '../../src/auth/jwt.js';
import { loadConfig } from '../../src/config.js';

describe('POST /api/auth/wechat-unbind', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    ctx = await buildApp();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function makeUser(opts: { username: string; wechatOpenId?: string | null }) {
    return ctx.prisma.user.create({
      data: {
        username: opts.username,
        displayName: opts.username,
        passwordHash: await hashPassword('whatever123'),
        wechatOpenId: opts.wechatOpenId ?? null,
        wechatBoundAt: opts.wechatOpenId ? new Date() : null,
      },
    });
  }

  async function tokenFor(userId: string): Promise<string> {
    const cfg = loadConfig();
    return signAccess({ sub: userId }, cfg.jwt.secret, cfg.jwt.accessTtl);
  }

  it('clears wechatOpenId and wechatBoundAt for a bound user', async () => {
    const user = await makeUser({ username: 'alice', wechatOpenId: 'wxid-1' });
    // Also seed a subscription that should be wiped
    await ctx.prisma.wechatSubscription.create({
      data: { userId: user.id, templateId: 'tpl-1', quota: 3 },
    });

    const token = await tokenFor(user.id);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { id: string; hasWechatBound: boolean } };
    expect(body.user.id).toBe(user.id);
    expect(body.user.hasWechatBound).toBe(false);

    // Verify DB state
    const after = await ctx.prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.wechatOpenId).toBeNull();
    expect(after?.wechatBoundAt).toBeNull();

    // Verify subscription wiped
    const subs = await ctx.prisma.wechatSubscription.findMany({ where: { userId: user.id } });
    expect(subs.length).toBe(0);
  });

  it('returns 400 NOT_BOUND when user has no wechat binding', async () => {
    const user = await makeUser({ username: 'unbound', wechatOpenId: null });
    const token = await tokenFor(user.id);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'NOT_BOUND' });
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
    });
    expect(res.statusCode).toBe(401);
  });
});
