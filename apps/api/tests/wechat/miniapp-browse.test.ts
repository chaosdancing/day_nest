// Cross-package integration test that imports miniapp source. Excluded from
// the api's tsc build via tsconfig.json#exclude (vitest still runs it via
// esbuild). See sibling miniapp-integration.test.ts for the rationale.
//
// This is NOT a UI smoke test — it does not invoke `Page({...})`. It proves
// the wire format between `miniapp/lib/services/*` and `apps/api` matches by
// rewiring `wx.request` to `app.inject(...)` and exercising the service layer
// against a real Fastify instance.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signAccess } from '../../src/auth/jwt.js';
import {
  installWxMock,
  uninstallWxMock,
  type WxMock,
} from '../../../miniapp/tests/helpers/wxMock.js';
import { authStore } from '../../../miniapp/miniprogram/stores/authStore.js';
import { collectionsService } from '../../../miniapp/miniprogram/lib/services/collections.js';
import { favoritesService } from '../../../miniapp/miniprogram/lib/services/favorites.js';
import { tagsService } from '../../../miniapp/miniprogram/lib/services/tags.js';

describe('miniapp browse — end-to-end via real Fastify', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;
  let accessToken: string;

  beforeEach(async () => {
    mock = installWxMock();
    ctx = await buildApp();
    authStore.reset();

    const user = await ctx.prisma.user.create({
      data: {
        username: 'browser',
        displayName: 'Browser',
        passwordHash: await hashPassword('browserpw123'),
      },
    });
    userId = user.id;
    accessToken = await signAccess(
      { sub: user.id },
      ctx.config.jwt.secret,
      ctx.config.jwt.accessTtl,
    );
    authStore.setTokens(accessToken, 'refresh-stub');

    // Rewire wx.request to route into the Fastify app via inject(). The
    // service layer's Bearer-header logic is real; only the transport is
    // swapped from real HTTP to in-process inject.
    (globalThis as Record<string, unknown>).wx = {
      ...((globalThis as Record<string, unknown>).wx as object),
      getStorageSync: (k: string) => mock.storage.get(k) ?? '',
      setStorageSync: (k: string, v: unknown) => {
        mock.storage.set(k, v);
      },
      removeStorageSync: (k: string) => {
        mock.storage.delete(k);
      },
      request: (o: {
        url: string;
        method?: string;
        data?: unknown;
        header?: Record<string, string>;
        success: (r: { statusCode: number; data: unknown }) => void;
        fail: (e: unknown) => void;
      }) => {
        const u = new URL(o.url);
        ctx.app
          .inject({
            method: (o.method ?? 'GET') as
              | 'GET'
              | 'POST'
              | 'DELETE'
              | 'PATCH',
            url: u.pathname + u.search,
            payload: o.data as Record<string, unknown> | undefined,
            headers: o.header,
          })
          .then((res) => {
            let data: unknown = {};
            try {
              data = res.json();
            } catch {
              data = {};
            }
            o.success({ statusCode: res.statusCode, data });
          })
          .catch(o.fail);
        return { abort: () => undefined };
      },
    };
  });

  afterEach(async () => {
    uninstallWxMock();
    await ctx.cleanup();
  });

  async function seedCollection(title: string, photoCount = 3) {
    const collection = await ctx.prisma.collection.create({
      data: {
        title,
        occurredOn: new Date('2026-05-01'),
        createdById: userId,
        photoCount,
      },
    });
    const photos = [];
    for (let i = 0; i < photoCount; i++) {
      const p = await ctx.prisma.photo.create({
        data: {
          collectionId: collection.id,
          fileKey: `k-${collection.id}-${i}`,
          width: 1000,
          height: 750,
          caption: null,
          takenAt: null,
          orderIndex: i,
          uploadedById: userId,
        },
      });
      photos.push(p);
    }
    return { collection, photos };
  }

  it('collectionsService.list() returns seeded collections', async () => {
    await seedCollection('Spring trip', 4);
    await seedCollection('Birthday', 2);

    const res = await collectionsService.list({ limit: 20 });
    expect(res.items.length).toBe(2);
    const titles = res.items.map((c) => c.title).sort();
    expect(titles).toEqual(['Birthday', 'Spring trip']);
  });

  it('collectionsService.list({ title }) fuzzy-matches by title', async () => {
    await seedCollection('Spring trip', 2);
    await seedCollection('Summer beach', 2);

    const res = await collectionsService.list({ title: 'Spring', limit: 20 });
    expect(res.items.length).toBe(1);
    expect(res.items[0]?.title).toBe('Spring trip');
  });

  it('collectionsService.get(id) returns photos', async () => {
    const { collection } = await seedCollection('detail-test', 3);
    const res = await collectionsService.get(collection.id);
    expect(res.title).toBe('detail-test');
    expect(res.photos.length).toBe(3);
  });

  it('favoritesService.add/remove toggles favorite state', async () => {
    const { photos } = await seedCollection('fav-test', 2);
    const target = photos[0]!;

    await favoritesService.add(target.id);
    const after = await ctx.prisma.photoFavorite.findUnique({
      where: { photoId_userId: { photoId: target.id, userId } },
    });
    expect(after).not.toBeNull();

    await favoritesService.remove(target.id);
    const removed = await ctx.prisma.photoFavorite.findUnique({
      where: { photoId_userId: { photoId: target.id, userId } },
    });
    expect(removed).toBeNull();
  });

  it('favoritesService.list() returns favorited photos in newest-first order', async () => {
    const { photos } = await seedCollection('fav-list', 3);
    for (const p of photos) {
      await ctx.prisma.photoFavorite.create({
        data: { photoId: p.id, userId },
      });
      // Small delay so createdAt differs measurably between rows.
      await new Promise((r) => setTimeout(r, 5));
    }
    const res = await favoritesService.list({ limit: 30 });
    expect(res.items.length).toBe(3);
    // Last-added photo should come first.
    expect(res.items[0]?.photo.id).toBe(photos[2]!.id);
  });

  it('tagsService.list() returns all tags with counts', async () => {
    const tag = await ctx.prisma.tag.create({
      data: { name: 'travel', displayName: 'Travel', createdById: userId },
    });
    const { collection } = await seedCollection('tag-test', 1);
    await ctx.prisma.collectionTag.create({
      data: { collectionId: collection.id, tagId: tag.id },
    });

    const res = await tagsService.list();
    expect(res.length).toBe(1);
    expect(res[0]?.displayName).toBe('Travel');
    expect(res[0]?.collectionCount).toBe(1);
  });
});
