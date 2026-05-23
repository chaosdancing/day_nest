// Cross-package integration test that imports miniapp source. Excluded from
// the api's tsc build via tsconfig.json#exclude (vitest still runs it via
// esbuild). See sibling miniapp-browse.test.ts for the rationale.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signAccess } from '../../src/auth/jwt.js';
import { installWxMock, uninstallWxMock, type WxMock } from '../../../miniapp/tests/helpers/wxMock.js';
import { authStore } from '../../../miniapp/miniprogram/stores/authStore.js';
import { collectionsService } from '../../../miniapp/miniprogram/lib/services/collections.js';
import { tagsService } from '../../../miniapp/miniprogram/lib/services/tags.js';

describe('miniapp tags interactions — end-to-end via real Fastify', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;

  beforeEach(async () => {
    mock = installWxMock();
    ctx = await buildApp();
    authStore.reset();

    const user = await ctx.prisma.user.create({
      data: {
        username: 'taguser',
        displayName: 'Tag User',
        passwordHash: await hashPassword('tagpw1234567'),
      },
    });
    userId = user.id;
    const accessToken = await signAccess(
      { sub: user.id },
      ctx.config.jwt.secret,
      ctx.config.jwt.accessTtl,
    );
    authStore.setTokens(accessToken, 'refresh-stub');

    (globalThis as Record<string, unknown>).wx = {
      ...((globalThis as Record<string, unknown>).wx as object),
      getStorageSync: (k: string) => mock.storage.get(k) ?? '',
      setStorageSync: (k: string, v: unknown) => { mock.storage.set(k, v); },
      removeStorageSync: (k: string) => { mock.storage.delete(k); },
      request: (o: {
        url: string;
        method?: string;
        data?: unknown;
        header?: Record<string, string>;
        success: (r: { statusCode: number; data: unknown }) => void;
        fail: (e: unknown) => void;
      }) => {
        const u = new URL(o.url);
        ctx.app.inject({
          method: (o.method ?? 'GET') as 'GET' | 'POST' | 'DELETE' | 'PATCH',
          url: u.pathname + u.search,
          payload: o.data as Record<string, unknown> | undefined,
          headers: o.header,
        }).then((res) => {
          let data: unknown = {};
          try { data = res.json(); } catch { data = {}; }
          o.success({ statusCode: res.statusCode, data });
        }).catch(o.fail);
        return { abort: () => undefined };
      },
    };
  });

  afterEach(async () => {
    uninstallWxMock();
    await ctx.cleanup();
  });

  async function seedTagOnCollection(displayName: string, scope: 'collection' | 'photo') {
    const tag = await ctx.prisma.tag.create({
      data: {
        name: displayName.toLocaleLowerCase().trim(),
        displayName,
        createdById: userId,
      },
    });
    const collection = await ctx.prisma.collection.create({
      data: {
        title: `${displayName}-col`,
        occurredOn: new Date('2026-05-01'),
        createdById: userId,
        photoCount: 1,
      },
    });
    const photo = await ctx.prisma.photo.create({
      data: {
        collectionId: collection.id,
        fileKey: `k-${collection.id}-0`,
        width: 1000,
        height: 750,
        caption: null,
        takenAt: null,
        orderIndex: 0,
        uploadedById: userId,
      },
    });
    if (scope === 'collection') {
      await ctx.prisma.collectionTag.create({ data: { collectionId: collection.id, tagId: tag.id } });
    } else {
      await ctx.prisma.photoTag.create({ data: { photoId: photo.id, tagId: tag.id } });
    }
    return { tag, collection, photo };
  }

  it('collectionsService.list({ tag, tagScope: "all" }) returns both collection- and photo-tagged collections', async () => {
    const { tag } = await seedTagOnCollection('travel', 'collection');
    const photoOnly = await ctx.prisma.collection.create({
      data: { title: 'photo-only', occurredOn: new Date('2026-05-02'), createdById: userId, photoCount: 1 },
    });
    const ph = await ctx.prisma.photo.create({
      data: { collectionId: photoOnly.id, fileKey: 'k-x-0', width: 1000, height: 750, caption: null, takenAt: null, orderIndex: 0, uploadedById: userId },
    });
    await ctx.prisma.photoTag.create({ data: { photoId: ph.id, tagId: tag.id } });

    const res = await collectionsService.list({ tag: 'travel', tagScope: 'all', limit: 20 });
    const titles = res.items.map((c) => c.title).sort();
    expect(titles).toEqual(['photo-only', 'travel-col']);
  });

  it('collectionsService.list({ tag, tagScope: "collection" }) filters to collection-level tags only', async () => {
    const { tag } = await seedTagOnCollection('travel', 'collection');
    const photoOnly = await ctx.prisma.collection.create({
      data: { title: 'photo-only', occurredOn: new Date('2026-05-02'), createdById: userId, photoCount: 1 },
    });
    const ph = await ctx.prisma.photo.create({
      data: { collectionId: photoOnly.id, fileKey: 'k-x-0', width: 1000, height: 750, caption: null, takenAt: null, orderIndex: 0, uploadedById: userId },
    });
    await ctx.prisma.photoTag.create({ data: { photoId: ph.id, tagId: tag.id } });

    const res = await collectionsService.list({ tag: 'travel', tagScope: 'collection', limit: 20 });
    expect(res.items.map((c) => c.title)).toEqual(['travel-col']);
  });

  it('collectionsService.list({ tag, tagScope: "photo" }) filters to photo-level tags only', async () => {
    const { tag } = await seedTagOnCollection('travel', 'collection');
    const photoOnly = await ctx.prisma.collection.create({
      data: { title: 'photo-only', occurredOn: new Date('2026-05-02'), createdById: userId, photoCount: 1 },
    });
    const ph = await ctx.prisma.photo.create({
      data: { collectionId: photoOnly.id, fileKey: 'k-x-0', width: 1000, height: 750, caption: null, takenAt: null, orderIndex: 0, uploadedById: userId },
    });
    await ctx.prisma.photoTag.create({ data: { photoId: ph.id, tagId: tag.id } });

    const res = await collectionsService.list({ tag: 'travel', tagScope: 'photo', limit: 20 });
    expect(res.items.map((c) => c.title)).toEqual(['photo-only']);
  });

  it('tagsService.rename happy path: updates displayName, returns merged: false', async () => {
    await seedTagOnCollection('travel', 'collection');

    const res = await tagsService.rename('travel', 'Travel');
    expect(res.merged).toBe(false);
    expect(res.displayName).toBe('Travel');
    expect(res.name).toBe('travel');

    const after = await ctx.prisma.tag.findUnique({ where: { name: 'travel' } });
    expect(after?.displayName).toBe('Travel');
  });

  it('tagsService.rename merges when the new normalized name already exists', async () => {
    const { tag: source } = await seedTagOnCollection('trip', 'collection');
    const { tag: target } = await seedTagOnCollection('travel', 'photo');

    const res = await tagsService.rename(source.name, 'travel');
    expect(res.merged).toBe(true);
    expect(res.id).toBe(target.id);
    expect(res.displayName).toBe('travel');

    // The source tag is gone.
    const gone = await ctx.prisma.tag.findUnique({ where: { id: source.id } });
    expect(gone).toBeNull();
    // The target tag now owns both join rows (the source's collection link
    // was migrated; the target's photo link was already there).
    const collectionLinks = await ctx.prisma.collectionTag.findMany({ where: { tagId: target.id } });
    expect(collectionLinks.length).toBe(1);
    const photoLinks = await ctx.prisma.photoTag.findMany({ where: { tagId: target.id } });
    expect(photoLinks.length).toBe(1);
  });
});
