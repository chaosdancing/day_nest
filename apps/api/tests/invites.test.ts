import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

async function bootstrapUser(ctx: Awaited<ReturnType<typeof buildApp>>) {
  const user = await ctx.prisma.user.create({
    data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
  });
  const token = await signAccess({ sub: user.id }, ctx.config.jwt.secret, 60);
  return { user, token };
}

describe('POST /api/invites', () => {
  it('requires auth', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/invites' });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('creates a token', async () => {
    const ctx = await buildApp();
    const { token } = await bootstrapUser(ctx);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toMatch(/^[a-zA-Z0-9_-]{16,}$/);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    await ctx.cleanup();
  });
});
