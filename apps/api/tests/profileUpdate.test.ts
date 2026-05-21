import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

describe('PATCH /api/auth/me', () => {
  it('updates displayName and returns the fresh user DTO', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'jane', displayName: 'Jane', passwordHash: 'x' },
    });
    const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: '简' },
    });
    expect(r.statusCode).toBe(200);
    const b = r.json() as { user: { username: string; displayName: string } };
    expect(b.user.username).toBe('jane');
    expect(b.user.displayName).toBe('简');
    // Verify the row was actually mutated (not just echoed).
    const row = await ctx.prisma.user.findUnique({ where: { id: u.id } });
    expect(row?.displayName).toBe('简');
    await ctx.cleanup();
  });

  // The displayName is rendered as-is throughout the UI (header greeting,
  // photo viewer favorites list, etc.), so it has to faithfully round-trip
  // CJK, emoji, ZWJ-joined compound emoji, and miscellaneous symbols.
  it.each([
    ['妈妈', 'CJK characters'],
    ['🦊 Mom', 'emoji + ASCII'],
    ['👨‍👩‍👧', 'ZWJ-joined family emoji'],
    ['Ñoño & Co. ❤️', 'extended Latin + emoji + ampersand'],
    ['日 nesting 🪺', 'mixed CJK + ASCII + emoji'],
  ])('accepts %s (%s)', async (name) => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'unicode', displayName: 'Unicode', passwordHash: 'x' },
    });
    const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: name },
    });
    expect(r.statusCode).toBe(200);
    const row = await ctx.prisma.user.findUnique({ where: { id: u.id } });
    expect(row?.displayName).toBe(name);
    await ctx.cleanup();
  });

  it('rejects empty / whitespace displayName', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'whoops', displayName: 'Whoops', passwordHash: 'x' },
    });
    const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: '   ' },
    });
    expect(r.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('requires authentication', async () => {
    const ctx = await buildApp();
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      payload: { displayName: '随便' },
    });
    expect(r.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('ignores unknown fields (e.g. username) silently — username stays', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'fixed', displayName: 'Fixed', passwordHash: 'x' },
    });
    const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { username: 'hacker', displayName: '改名' },
    });
    expect(r.statusCode).toBe(200);
    const row = await ctx.prisma.user.findUnique({ where: { id: u.id } });
    expect(row?.username).toBe('fixed');
    expect(row?.displayName).toBe('改名');
    await ctx.cleanup();
  });
});
