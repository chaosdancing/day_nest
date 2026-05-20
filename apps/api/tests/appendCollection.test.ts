import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

async function authenticatedCtx() {
  const ctx = await buildApp();
  const u = await ctx.prisma.user.create({
    data: { username: 'mom', displayName: 'M', passwordHash: 'x' },
  });
  const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
  return { ...ctx, userId: u.id, token };
}

async function createCollection(
  ctx: Awaited<ReturnType<typeof authenticatedCtx>>,
  overrides: Record<string, unknown> = {}
) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/collections',
    headers: { authorization: `Bearer ${ctx.token}` },
    payload: {
      title: '富士山樱花季',
      description: null,
      occurredOn: '2024-04-12',
      occurredUntil: null,
      location: '日本',
      tags: ['日本', '樱花'],
      photos: [
        {
          fileKey: 'photos/draft/seed.jpg',
          width: 1000,
          height: 800,
          caption: null,
          takenAt: null,
          tags: ['河口湖'],
        },
      ],
      ...overrides,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; photoCount: number };
}

describe('GET /api/collections/by-title', () => {
  it('returns null when no collection matches', async () => {
    const ctx = await authenticatedCtx();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections/by-title?title=Nonexistent',
      headers: { authorization: `Bearer ${ctx.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      collection: null,
      directTags: [],
      matches: [],
    });
    await ctx.cleanup();
  });

  it('returns matching collection with direct (collection-level) tags', async () => {
    const ctx = await authenticatedCtx();
    await createCollection(ctx);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections/by-title?title=富士山樱花季',
      headers: { authorization: `Bearer ${ctx.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.collection).toBeTruthy();
    expect(body.collection.title).toBe('富士山樱花季');
    // The collection's overall tag set surfaces both collection-level + photo-level tags
    expect(
      body.collection.tags.map((t: { name: string }) => t.name).sort()
    ).toEqual(['日本', '樱花', '河口湖'].sort());
    // But the "direct" list only contains collection-level tags (the ones the user attached)
    expect((body.directTags as string[]).sort()).toEqual(
      ['日本', '樱花'].sort()
    );
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].matchType).toBe('exact');
    expect(body.matches[0].collection.id).toBe(body.collection.id);
    expect((body.matches[0].directTags as string[]).sort()).toEqual(
      ['日本', '樱花'].sort()
    );
    await ctx.cleanup();
  });

  it('returns fuzzy title candidates for user-controlled merge', async () => {
    const ctx = await authenticatedCtx();
    await createCollection(ctx, { title: '富士山樱花季' });
    await createCollection(ctx, {
      title: '奈良小鹿散步',
      tags: ['日本', '奈良'],
      photos: [
        {
          fileKey: 'photos/draft/nara.jpg',
          width: 1000,
          height: 800,
          caption: null,
          takenAt: null,
          tags: [],
        },
      ],
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections/by-title?title=富士山',
      headers: { authorization: `Bearer ${ctx.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.collection).toBe(null);
    expect(body.directTags).toEqual([]);
    expect(body.matches.map((m: { collection: { title: string } }) => m.collection.title)).toEqual([
      '富士山樱花季',
    ]);
    expect(body.matches[0].matchType).toBe('contains');
    expect(body.matches[0].score).toBeGreaterThan(0);
    await ctx.cleanup();
  });

  it('400 when title is empty/missing', async () => {
    const ctx = await authenticatedCtx();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections/by-title?title=',
      headers: { authorization: `Bearer ${ctx.token}` },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });
});

describe('POST /api/collections/:id/append', () => {
  it('appends photos and merges new tags additively', async () => {
    const ctx = await authenticatedCtx();
    const created = await createCollection(ctx);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/collections/${created.id}/append`,
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        photos: [
          {
            fileKey: 'photos/draft/p2.jpg',
            width: 2000,
            height: 1500,
            caption: null,
            takenAt: null,
            tags: ['富士山'],
          },
          {
            fileKey: 'photos/draft/p3.jpg',
            width: 2000,
            height: 1500,
            caption: null,
            takenAt: null,
            tags: [],
          },
        ],
        extraTags: ['2024春', '日本'],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.photoCount).toBe(3);
    // Union of collection-level + photo-level tags
    expect(body.tags.map((t: { name: string }) => t.name).sort()).toEqual(
      ['2024春', '富士山', '日本', '樱花', '河口湖'].sort()
    );
    // Photos retain orderIndex sequencing
    expect(body.photos.length).toBe(3);
    // Newly added photo carries its tag
    const p2 = body.photos.find((p: { fileKey: string }) =>
      p.fileKey.endsWith('p2.jpg')
    );
    expect(p2).toBeTruthy();
    expect(p2.tags).toEqual(['富士山']);

    // Confirm collection-level tags grew to include extraTags (and dedup '日本')
    const byTitle = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections/by-title?title=富士山樱花季',
      headers: { authorization: `Bearer ${ctx.token}` },
    });
    expect((byTitle.json().directTags as string[]).sort()).toEqual(
      ['2024春', '日本', '樱花'].sort()
    );
    await ctx.cleanup();
  });

  it('404 when the collection does not exist', async () => {
    const ctx = await authenticatedCtx();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/collections/00000000-0000-0000-0000-000000000000/append',
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: {
        photos: [
          {
            fileKey: 'photos/draft/x.jpg',
            width: 100,
            height: 100,
            caption: null,
            takenAt: null,
            tags: [],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(404);
    await ctx.cleanup();
  });

  it('400 with no photos', async () => {
    const ctx = await authenticatedCtx();
    const created = await createCollection(ctx);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/collections/${created.id}/append`,
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { photos: [], extraTags: [] },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });
});
