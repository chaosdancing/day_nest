import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

describe('collection detail / update / delete', () => {
  it('GET /:id returns photos + signed thumbnails', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'a', displayName: 'A', passwordHash: 'x' },
    });
    const id = await createCollection(ctx.prisma, u.id, {
      title: 't',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [
        {
          fileKey: 'photos/x.jpg',
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
      url: `/api/collections/${id}`,
      headers: { authorization: `Bearer ${t}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().photos[0].thumbnailUrl).toContain('thumbnail/x800');
    await ctx.cleanup();
  });

  it('GET /:id 404 for unknown id', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'a', displayName: 'A', passwordHash: 'x' },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${t}` },
    });
    expect(r.statusCode).toBe(404);
    await ctx.cleanup();
  });

  it('PATCH /:id updates title and tags', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'a', displayName: 'A', passwordHash: 'x' },
    });
    const id = await createCollection(ctx.prisma, u.id, {
      title: 'old',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['old'],
      photos: [
        {
          fileKey: 'photos/x.jpg',
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
      method: 'PATCH',
      url: `/api/collections/${id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { title: 'new', tags: ['fresh'] },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.title).toBe('new');
    expect(body.tags.map((x: { name: string }) => x.name)).toContain('fresh');
    expect(body.tags.map((x: { name: string }) => x.name)).not.toContain('old');
    await ctx.cleanup();
  });

  it('DELETE /:id removes db rows and storage files', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({
      data: { username: 'a', displayName: 'A', passwordHash: 'x' },
    });
    const id = await createCollection(ctx.prisma, u.id, {
      title: 't',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [
        {
          fileKey: 'photos/zap.jpg',
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
      method: 'DELETE',
      url: `/api/collections/${id}`,
      headers: { authorization: `Bearer ${t}` },
    });
    expect(r.statusCode).toBe(204);
    expect(ctx.storage.deleted).toContain('photos/zap.jpg');
    expect(await ctx.prisma.collection.count()).toBe(0);
    await ctx.cleanup();
  });
});
