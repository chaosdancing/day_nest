import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import {
  appendToCollection,
  createCollection,
} from '../src/services/collections.js';

async function makeUser(ctx: Awaited<ReturnType<typeof buildApp>>) {
  const u = await ctx.prisma.user.create({
    data: { username: 'u', displayName: 'U', passwordHash: 'x' },
  });
  const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
  return { userId: u.id, token };
}

function photo(idx: number, tags: string[] = []) {
  return {
    fileKey: `pp/${idx}.jpg`,
    width: 100,
    height: 100,
    caption: null,
    takenAt: null,
    tags,
  };
}

describe('denormalized Collection.photoCount', () => {
  it('createCollection stores the initial photo count', async () => {
    const ctx = await buildApp();
    const { userId } = await makeUser(ctx);
    const id = await createCollection(ctx.prisma, userId, {
      title: 'c',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [photo(0), photo(1), photo(2)],
    });
    const row = await ctx.prisma.collection.findUniqueOrThrow({ where: { id } });
    expect(row.photoCount).toBe(3);
    await ctx.cleanup();
  });

  it('appendToCollection increments the cached count', async () => {
    const ctx = await buildApp();
    const { userId } = await makeUser(ctx);
    const id = await createCollection(ctx.prisma, userId, {
      title: 'c',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [photo(0)],
    });
    await appendToCollection(ctx.prisma, userId, id, {
      photos: [photo(1), photo(2)],
      extraTags: [],
    });
    const row = await ctx.prisma.collection.findUniqueOrThrow({ where: { id } });
    expect(row.photoCount).toBe(3);
    await ctx.cleanup();
  });

  it('DELETE /api/photos/:id decrements the cached count', async () => {
    const ctx = await buildApp();
    const { userId, token } = await makeUser(ctx);
    const id = await createCollection(ctx.prisma, userId, {
      title: 'c',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [photo(0), photo(1)],
    });
    const p = await ctx.prisma.photo.findFirstOrThrow({
      where: { collectionId: id, fileKey: 'pp/1.jpg' },
    });
    const r = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/photos/${p.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(204);
    const row = await ctx.prisma.collection.findUniqueOrThrow({ where: { id } });
    expect(row.photoCount).toBe(1);
    await ctx.cleanup();
  });

  it('list endpoint surfaces photoCount on each summary', async () => {
    const ctx = await buildApp();
    const { userId, token } = await makeUser(ctx);
    await createCollection(ctx.prisma, userId, {
      title: 'big',
      description: null,
      occurredOn: '2024-06-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: Array.from({ length: 7 }, (_, i) => photo(i)),
    });
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?limit=5',
      headers: { authorization: `Bearer ${token}` },
    });
    const b = r.json() as {
      items: Array<{ title: string; photoCount: number; previewPhotos: unknown[] }>;
    };
    const item = b.items.find((i) => i.title === 'big')!;
    expect(item.photoCount).toBe(7);
    // Stack stays capped at 3 even when the underlying collection is
    // much larger — the count is what tells the user "there's more".
    expect(item.previewPhotos).toHaveLength(3);
    await ctx.cleanup();
  });
});

describe('photo-tag → collection-tag inheritance', () => {
  it('promotes photo tags onto an untagged collection on PATCH', async () => {
    const ctx = await buildApp();
    const { userId, token } = await makeUser(ctx);
    const id = await createCollection(ctx.prisma, userId, {
      title: 'untagged',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: [], // collection deliberately has zero direct tags
      photos: [photo(0)],
    });
    const p = await ctx.prisma.photo.findFirstOrThrow({
      where: { collectionId: id },
    });
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/photos/${p.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tags: ['夏天', '海边'] },
    });
    expect(r.statusCode).toBe(200);
    const directTags = await ctx.prisma.collectionTag.findMany({
      where: { collectionId: id },
      include: { tag: true },
    });
    const names = directTags.map((d) => d.tag.displayName).sort();
    expect(names).toEqual(['夏天', '海边']);
    await ctx.cleanup();
  });

  it('does NOT touch collection tags when the collection already has direct tags', async () => {
    const ctx = await buildApp();
    const { userId, token } = await makeUser(ctx);
    const id = await createCollection(ctx.prisma, userId, {
      title: 'pre-tagged',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['毕业'], // already has a direct collection tag
      photos: [photo(0)],
    });
    const p = await ctx.prisma.photo.findFirstOrThrow({
      where: { collectionId: id },
    });
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/photos/${p.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tags: ['新标签'] },
    });
    const directTags = await ctx.prisma.collectionTag.findMany({
      where: { collectionId: id },
      include: { tag: true },
    });
    const names = directTags.map((d) => d.tag.displayName).sort();
    // Collection tags untouched: only the original "毕业" remains direct.
    // "新标签" lives only on the photo, not on the collection.
    expect(names).toEqual(['毕业']);
    await ctx.cleanup();
  });

  it('does NOT promote when the new photo tag list is empty (clearing photo tags)', async () => {
    const ctx = await buildApp();
    const { userId, token } = await makeUser(ctx);
    const id = await createCollection(ctx.prisma, userId, {
      title: 'untagged-clear',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [photo(0, ['草稿'])],
    });
    const p = await ctx.prisma.photo.findFirstOrThrow({
      where: { collectionId: id },
    });
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/photos/${p.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tags: [] },
    });
    const directTags = await ctx.prisma.collectionTag.findMany({
      where: { collectionId: id },
    });
    expect(directTags).toHaveLength(0);
    await ctx.cleanup();
  });
});

describe('GET /api/collections?tag=X&tagScope=...', () => {
  /** Build two collections:
   *  - 'direct': has the tag at collection level
   *  - 'viaPhoto': has the tag only on a contained photo
   */
  async function setupTagSources(ctx: Awaited<ReturnType<typeof buildApp>>) {
    const { userId, token } = await makeUser(ctx);
    const directId = await createCollection(ctx.prisma, userId, {
      title: 'direct',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['樱花'],
      photos: [photo(0)],
    });
    const viaPhotoId = await createCollection(ctx.prisma, userId, {
      title: 'viaPhoto',
      description: null,
      occurredOn: '2024-02-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [photo(1, ['樱花'])],
    });
    return { token, directId, viaPhotoId };
  }

  it('default (no scope) unions direct + photo sources', async () => {
    const ctx = await buildApp();
    const { token } = await setupTagSources(ctx);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?tag=%E6%A8%B1%E8%8A%B1',
      headers: { authorization: `Bearer ${token}` },
    });
    const titles = (r.json() as { items: Array<{ title: string }> }).items
      .map((i) => i.title)
      .sort();
    expect(titles).toEqual(['direct', 'viaPhoto']);
    await ctx.cleanup();
  });

  it('tagScope=collection returns only collections with the tag at collection level', async () => {
    const ctx = await buildApp();
    const { token } = await setupTagSources(ctx);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?tag=%E6%A8%B1%E8%8A%B1&tagScope=collection',
      headers: { authorization: `Bearer ${token}` },
    });
    const titles = (r.json() as { items: Array<{ title: string }> }).items
      .map((i) => i.title)
      .sort();
    expect(titles).toEqual(['direct']);
    await ctx.cleanup();
  });

  it('tagScope=photo returns only collections whose photos carry the tag', async () => {
    const ctx = await buildApp();
    const { token } = await setupTagSources(ctx);
    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections?tag=%E6%A8%B1%E8%8A%B1&tagScope=photo',
      headers: { authorization: `Bearer ${token}` },
    });
    const titles = (r.json() as { items: Array<{ title: string }> }).items
      .map((i) => i.title)
      .sort();
    expect(titles).toEqual(['viaPhoto']);
    await ctx.cleanup();
  });
});
