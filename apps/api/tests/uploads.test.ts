import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

describe('POST /api/uploads/token', () => {
  it('requires auth', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/uploads/token',
      payload: { ext: 'jpg' },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('returns N tokens under photos/', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'M', passwordHash: 'x' },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/uploads/token',
      headers: { authorization: `Bearer ${t}` },
      payload: { ext: 'jpg', count: 3 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tokens).toHaveLength(3);
    body.tokens.forEach((tk: { key: string; token: string }) => {
      expect(tk.key).toMatch(/^photos\//);
      expect(tk.key.endsWith('.jpg')).toBe(true);
      expect(tk.token).toMatch(/fake-token/);
    });
    await ctx.cleanup();
  });

  it('honors collectionDraftId in the key', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'm', displayName: 'M', passwordHash: 'x' },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/uploads/token',
      headers: { authorization: `Bearer ${t}` },
      payload: { ext: 'png', count: 1, collectionDraftId: 'draft-abc' },
    });
    const body = res.json();
    expect(body.tokens[0].key).toMatch(/^photos\/draft-abc\//);
    expect(body.tokens[0].key.endsWith('.png')).toBe(true);
    await ctx.cleanup();
  });
});
