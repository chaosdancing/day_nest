import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

describe('GET /api/tags', () => {
  it('returns tags with counts sorted by hot', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'a', displayName: 'A', passwordHash: 'x' },
    });
    await createCollection(ctx.prisma, u.id, {
      title: 't1',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['樱花'],
      photos: [
        {
          fileKey: 'p1.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: ['日本'],
        },
      ],
    });
    await createCollection(ctx.prisma, u.id, {
      title: 't2',
      description: null,
      occurredOn: '2024-02-01',
      occurredUntil: null,
      location: null,
      tags: ['樱花'],
      photos: [
        {
          fileKey: 'p2.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: [],
        },
      ],
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/tags',
      headers: { authorization: `Bearer ${t}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    const sakura = body.find(
      (t: { name: string }) => t.name === '樱花'
    );
    expect(sakura.collectionCount).toBe(2);
    const ja = body.find((t: { name: string }) => t.name === '日本');
    expect(ja.collectionCount).toBe(0);
    expect(ja.photoCount).toBe(1);
    expect(body[0].name).toBe('樱花');
    await ctx.cleanup();
  });
});
