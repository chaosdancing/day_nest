import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

describe('POST /api/collections', () => {
  it('creates collection + photos + tags transactionally', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'M', passwordHash: 'x' },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/collections',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        title: '富士山樱花季',
        description: '一场粉色的迁徙',
        occurredOn: '2024-04-12',
        occurredUntil: '2024-04-18',
        location: '日本 山梨县',
        tags: ['日本', '樱花'],
        photos: [
          {
            fileKey: 'photos/draft/p1.jpg',
            width: 4000,
            height: 3000,
            caption: '河口湖',
            takenAt: null,
            tags: ['河口湖'],
          },
          {
            fileKey: 'photos/draft/p2.jpg',
            width: 4000,
            height: 3000,
            caption: null,
            takenAt: null,
            tags: [],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTruthy();
    expect(body.photoCount).toBe(2);
    expect(body.tags.map((t: { name: string }) => t.name).sort()).toEqual(
      ['樱花', '日本', '河口湖'].sort()
    );
    expect(body.coverPhoto.fileKey).toBe('photos/draft/p1.jpg');
    expect(body.coverPhoto.thumbnailUrl).toContain('thumbnail/x800');
    expect(await ctx.prisma.tag.count()).toBe(3);
    await ctx.cleanup();
  });

  it('requires at least one photo', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'M', passwordHash: 'x' },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/collections',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        title: 't',
        occurredOn: '2024-01-01',
        tags: [],
        photos: [],
      },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });
});
