import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';

describe('POST /api/auth/register', () => {
  it('creates new user with valid invite', async () => {
    const ctx = await buildApp();
    const bootstrapUser = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
    });
    const invite = await ctx.prisma.invite.create({
      data: {
        token: 'invite-token-1234567890',
        issuedById: bootstrapUser.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        inviteToken: invite.token,
        username: 'dad',
        displayName: 'Dad',
        password: 'longenoughpw',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe('dad');
    expect(body.accessToken).toBeTruthy();
    expect(await ctx.prisma.user.count()).toBe(2);
    const updatedInvite = await ctx.prisma.invite.findUnique({
      where: { id: invite.id },
    });
    expect(updatedInvite!.consumedAt).not.toBeNull();
    await ctx.cleanup();
  });

  it('rejects bad invite', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        inviteToken: 'does-not-exist-1234',
        username: 'who',
        displayName: 'X',
        password: 'longenoughpw',
      },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('rejects duplicate username', async () => {
    const ctx = await buildApp();
    const issuer = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
    });
    const invite = await ctx.prisma.invite.create({
      data: {
        token: 'invite-token-zzz12345',
        issuedById: issuer.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        inviteToken: invite.token,
        username: 'mom',
        displayName: 'Y',
        password: 'longenoughpw',
      },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('rejects expired invite', async () => {
    const ctx = await buildApp();
    const issuer = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
    });
    const invite = await ctx.prisma.invite.create({
      data: {
        token: 'expired-token-zzz12345',
        issuedById: issuer.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        inviteToken: invite.token,
        username: 'dad',
        displayName: 'D',
        password: 'longenoughpw',
      },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });
});
