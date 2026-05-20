import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

async function seed(ctx: Awaited<ReturnType<typeof buildApp>>) {
  const u = await ctx.prisma.user.create({
    data: { username: 'a', displayName: 'A', passwordHash: 'x' },
  });
  for (let i = 0; i < 25; i++) {
    const month = ((i % 12) + 1).toString().padStart(2, '0');
    await createCollection(ctx.prisma, u.id, {
      title: `c${i}`,
      description: null,
      occurredOn: `2024-${month}-15`,
      occurredUntil: null,
      location: null,
      tags: i % 2 ? ['樱花'] : ['毕业'],
      photos: [
        {
          fileKey: `photos/${i}.jpg`,
          width: 100,
          height: 100,
          caption: null,
          takenAt: null,
          tags: [],
        },
      ],
    });
  }
  const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
  return { token: t };
}

describe('GET /api/collections', () => {
  it('paginates by cursor in occurred_on DESC', async () => {
    const ctx = await buildApp();
    const { token } = await seed(ctx);
    const r1 = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?limit=10',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r1.statusCode).toBe(200);
    const b1 = r1.json();
    expect(b1.items).toHaveLength(10);
    expect(b1.nextCursor).toBeTruthy();
    const r2 = await ctx.app.inject({
      method: 'GET',
      url: `/api/collections?limit=10&cursor=${encodeURIComponent(b1.nextCursor)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const b2 = r2.json();
    expect(b2.items).toHaveLength(10);
    const ids1 = new Set(b1.items.map((i: { id: string }) => i.id));
    b2.items.forEach((i: { id: string }) => expect(ids1.has(i.id)).toBe(false));
    await ctx.cleanup();
  });

  it('filters by tag', async () => {
    const ctx = await buildApp();
    const { token } = await seed(ctx);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?tag=樱花&limit=50',
      headers: { authorization: `Bearer ${token}` },
    });
    const b = r.json();
    expect(b.items.length).toBeGreaterThan(0);
    b.items.forEach((c: { tags: { name: string }[] }) =>
      expect(c.tags.some((t) => t.name === '樱花')).toBe(true)
    );
    await ctx.cleanup();
  });

  it('returns empty for unknown tag', async () => {
    const ctx = await buildApp();
    const { token } = await seed(ctx);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?tag=does-not-exist',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.json()).toEqual({ items: [], nextCursor: null });
    await ctx.cleanup();
  });
});
