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
      location: i % 3 === 0 ? '北京' : i % 3 === 1 ? '上海' : '广州',
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

  it('returns up to 3 previewPhotos per summary, cover first, deduped', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'pp', displayName: 'PP', passwordHash: 'x' },
    });
    const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    // Create one collection with five photos so we can verify the
    // truncation and the cover-first ordering in one shot.
    await createCollection(ctx.prisma, u.id, {
      title: 'manyphotos',
      description: null,
      occurredOn: '2024-06-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: Array.from({ length: 5 }, (_, i) => ({
        fileKey: `pp/${i}.jpg`,
        width: 100,
        height: 100,
        caption: null,
        takenAt: null,
        tags: [],
      })),
    });
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?limit=5',
      headers: { authorization: `Bearer ${token}` },
    });
    const b = r.json() as {
      items: Array<{
        coverPhoto: { id: string } | null;
        previewPhotos: Array<{ id: string }>;
        photoCount: number;
      }>;
    };
    const item = b.items.find((i) => i.photoCount === 5);
    expect(item).toBeDefined();
    expect(item!.previewPhotos).toHaveLength(3);
    expect(item!.previewPhotos[0]!.id).toBe(item!.coverPhoto!.id);
    const ids = item!.previewPhotos.map((p) => p.id);
    expect(new Set(ids).size).toBe(3); // no duplicates
    await ctx.cleanup();
  });

  it('filters by fuzzy title substring (case-insensitive ASCII, exact CJK)', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'tt', displayName: 'TT', passwordHash: 'x' },
    });
    const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    for (const title of ['周末野餐', '生日蛋糕', '周末电影', '春节大餐']) {
      await createCollection(ctx.prisma, u.id, {
        title,
        description: null,
        occurredOn: '2024-06-01',
        occurredUntil: null,
        location: null,
        tags: [],
        photos: [
          {
            fileKey: `t/${title}.jpg`,
            width: 10,
            height: 10,
            caption: null,
            takenAt: null,
            tags: [],
          },
        ],
      });
    }
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?title=%E5%91%A8%E6%9C%AB&limit=20',
      headers: { authorization: `Bearer ${token}` },
    });
    const b = r.json() as { items: Array<{ title: string }> };
    const titles = b.items.map((i) => i.title).sort();
    expect(titles).toEqual(['周末电影', '周末野餐']);
    await ctx.cleanup();
  });

  it('filters by occurred date range and fuzzy location', async () => {
    const ctx = await buildApp();
    const { token } = await seed(ctx);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?dateFrom=2024-03-01&dateTo=2024-05-31&location=上&limit=50',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.items.map((i: { title: string }) => i.title).sort()).toEqual([
      'c16',
      'c4',
    ]);
    b.items.forEach((i: { location: string }) => expect(i.location).toBe('上海'));
    await ctx.cleanup();
  });
});
