import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signAccess } from '../../src/auth/jwt.js';
import { loadConfig } from '../../src/config.js';
import { WECHAT_TEMPLATES } from '@daynest/shared';

describe('POST /api/wechat/subscribe', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: {
        username: 'subuser',
        displayName: 'Sub User',
        passwordHash: await hashPassword('whatever123'),
      },
    });
    userId = u.id;
    const cfg = loadConfig();
    token = await signAccess({ sub: userId }, cfg.jwt.secret, cfg.jwt.accessTtl);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('creates WechatSubscription rows for accepted templates (first-time)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        accepted: [WECHAT_TEMPLATES.NEW_PHOTO, WECHAT_TEMPLATES.WEEKLY_DIGEST],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, recorded: 2 });

    const subs = await ctx.prisma.wechatSubscription.findMany({
      where: { userId },
      orderBy: { templateId: 'asc' },
    });
    expect(subs.length).toBe(2);
    expect(subs[0]?.quota).toBe(1);
    expect(subs[1]?.quota).toBe(1);
  });

  it('increments quota when user re-subscribes to existing templates', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { accepted: [WECHAT_TEMPLATES.NEW_PHOTO] },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { accepted: [WECHAT_TEMPLATES.NEW_PHOTO] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, recorded: 1 });

    const sub = await ctx.prisma.wechatSubscription.findUnique({
      where: { userId_templateId: { userId, templateId: WECHAT_TEMPLATES.NEW_PHOTO } },
    });
    expect(sub?.quota).toBe(2);
  });

  it('handles empty array as no-op (recorded:0)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { accepted: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, recorded: 0 });

    const subs = await ctx.prisma.wechatSubscription.findMany({ where: { userId } });
    expect(subs.length).toBe(0);
  });

  it('treats duplicates in array as separate authorizations', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { accepted: [WECHAT_TEMPLATES.NEW_PHOTO, WECHAT_TEMPLATES.NEW_PHOTO] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, recorded: 2 });

    const sub = await ctx.prisma.wechatSubscription.findUnique({
      where: { userId_templateId: { userId, templateId: WECHAT_TEMPLATES.NEW_PHOTO } },
    });
    expect(sub?.quota).toBe(2);
  });

  it('returns 400 VALIDATION_ERROR for unknown template id', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { accepted: ['unknown-template-id'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      payload: { accepted: [WECHAT_TEMPLATES.NEW_PHOTO] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('two users have isolated quota', async () => {
    const u2 = await ctx.prisma.user.create({
      data: {
        username: 'user2',
        displayName: 'U2',
        passwordHash: await hashPassword('pw'),
      },
    });
    const cfg = loadConfig();
    const t2 = await signAccess({ sub: u2.id }, cfg.jwt.secret, cfg.jwt.accessTtl);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { accepted: [WECHAT_TEMPLATES.NEW_PHOTO] },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${t2}` },
      payload: { accepted: [WECHAT_TEMPLATES.NEW_PHOTO, WECHAT_TEMPLATES.WEEKLY_DIGEST] },
    });

    const u1Subs = await ctx.prisma.wechatSubscription.findMany({ where: { userId } });
    const u2Subs = await ctx.prisma.wechatSubscription.findMany({ where: { userId: u2.id } });
    expect(u1Subs.length).toBe(1);
    expect(u2Subs.length).toBe(2);
  });
});
