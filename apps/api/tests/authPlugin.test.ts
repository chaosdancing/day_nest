import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

describe('auth plugin', () => {
  it('blocks request without token (401)', async () => {
    const ctx = await buildApp();
    ctx.app.get(
      '/private',
      { onRequest: [ctx.app.requireUser] },
      async (req) => ({ sub: req.user.id })
    );
    const res = await ctx.app.inject({ method: 'GET', url: '/private' });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('allows request with valid token', async () => {
    const ctx = await buildApp();
    const user = await ctx.prisma.user.create({
      data: { username: 'alice', displayName: 'Alice', passwordHash: 'x' },
    });
    ctx.app.get(
      '/private',
      { onRequest: [ctx.app.requireUser] },
      async (req) => ({ sub: req.user.id })
    );
    const token = await signAccess({ sub: user.id }, ctx.config.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/private',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sub: user.id });
    await ctx.cleanup();
  });

  it('rejects expired token', async () => {
    const ctx = await buildApp();
    const user = await ctx.prisma.user.create({
      data: { username: 'bob', displayName: 'Bob', passwordHash: 'x' },
    });
    ctx.app.get(
      '/private',
      { onRequest: [ctx.app.requireUser] },
      async () => ({ ok: true })
    );
    const token = await signAccess({ sub: user.id }, ctx.config.jwt.secret, -1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/private',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });
});
