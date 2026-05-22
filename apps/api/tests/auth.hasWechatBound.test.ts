import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';

describe('toUserDTO populates hasWechatBound', () => {
  it('register response includes hasWechatBound:false for a new user', async () => {
    const ctx = await buildApp();
    const issuer = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
    });
    const invite = await ctx.prisma.invite.create({
      data: {
        token: 'invite-token-hwb-aaaaaa',
        issuedById: issuer.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        inviteToken: invite.token,
        username: 'kid',
        displayName: 'Kid',
        password: 'longenoughpw',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { hasWechatBound: boolean } };
    expect(body.user.hasWechatBound).toBe(false);
    await ctx.cleanup();
  });

  it('GET /api/auth/me returns hasWechatBound:true after wechatOpenId is set', async () => {
    const ctx = await buildApp();
    const issuer = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
    });
    const invite = await ctx.prisma.invite.create({
      data: {
        token: 'invite-token-hwb-bbbbbb',
        issuedById: issuer.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const reg = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        inviteToken: invite.token,
        username: 'bound',
        displayName: 'Bound',
        password: 'longenoughpw',
      },
    });
    expect(reg.statusCode).toBe(200);
    const { accessToken } = reg.json() as { accessToken: string };

    await ctx.prisma.user.update({
      where: { username: 'bound' },
      data: { wechatOpenId: 'fake-openid', wechatBoundAt: new Date() },
    });

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    const body = me.json() as { user: { hasWechatBound: boolean } };
    expect(body.user.hasWechatBound).toBe(true);
    await ctx.cleanup();
  });
});
