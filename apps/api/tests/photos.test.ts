import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

describe('photos', () => {
  it('GET /:id/url returns signed download URL', async () => {
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
          fileKey: 'photos/original.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: [],
        },
      ],
    });
    const p = await ctx.prisma.photo.findFirstOrThrow({
      where: { collectionId: id },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'GET',
      url: `/api/photos/${p.id}/url`,
      headers: { authorization: `Bearer ${t}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().url).toContain('photos/original.jpg');
    expect(r.json().expiresIn).toBe(3600);
    await ctx.cleanup();
  });

  it('PATCH updates caption and tags', async () => {
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
          fileKey: 'photos/p.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: [],
        },
      ],
    });
    const p = await ctx.prisma.photo.findFirstOrThrow({
      where: { collectionId: id },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/photos/${p.id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { caption: '美丽', tags: ['美'] },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.caption).toBe('美丽');
    expect(body.tags).toContain('美');
    await ctx.cleanup();
  });

  it('DELETE removes photo and reassigns cover', async () => {
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
          fileKey: 'photos/cover.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: [],
        },
        {
          fileKey: 'photos/second.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: [],
        },
      ],
    });
    const before = await ctx.prisma.collection.findUniqueOrThrow({
      where: { id },
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/photos/${before.coverPhotoId}`,
      headers: { authorization: `Bearer ${t}` },
    });
    expect(r.statusCode).toBe(204);
    const after = await ctx.prisma.collection.findUniqueOrThrow({
      where: { id },
    });
    expect(after.coverPhotoId).not.toBe(before.coverPhotoId);
    expect(after.coverPhotoId).not.toBeNull();
    await ctx.cleanup();
  });
});
