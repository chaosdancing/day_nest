// Cross-package integration test that imports miniapp source. Excluded from
// the api's tsc build via tsconfig.json#exclude.

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
import { uploadsService } from '../../../miniapp/miniprogram/lib/services/uploads.js';
import { collectionsService } from '../../../miniapp/miniprogram/lib/services/collections.js';

describe('miniapp upload — end-to-end against real Fastify', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;

  beforeEach(async () => {
    mock = installWxMock();
    ctx = await buildApp();
    authStore.reset();

    const user = await ctx.prisma.user.create({
      data: {
        username: 'uploader',
        displayName: 'Uploader',
        passwordHash: await hashPassword('uploaderpw123'),
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

  it('uploadsService.requestTokens mints N tokens with the right key shape', async () => {
    const tokens = await uploadsService.requestTokens({
      ext: 'jpg', count: 3, collectionDraftId: 'draft-test-1',
    });
    expect(tokens.length).toBe(3);
    for (const t of tokens) {
      expect(typeof t.token).toBe('string');
      expect(t.key).toMatch(/^photos\/draft-test-1\/.+\.jpg$/);
      expect(typeof t.uploadUrl).toBe('string');
    }
  });

  it('collectionsService.byTitle returns null collection when no match', async () => {
    const res = await collectionsService.byTitle('nothing-here');
    expect(res.collection).toBeNull();
    expect(res.matches).toEqual([]);
  });

  it('collectionsService.create returns the new collection and surfaces via list', async () => {
    const created = await collectionsService.create({
      title: 'Spring trip',
      description: null,
      occurredOn: '2026-05-01',
      occurredUntil: null,
      location: null,
      tags: ['户外'],
      photos: [{ fileKey: 'k-1', width: 1600, height: 1200, caption: null, takenAt: null, tags: [] }],
    });
    expect(created.title).toBe('Spring trip');

    const list = await collectionsService.list({ limit: 10 });
    expect(list.items.map((c) => c.title)).toContain('Spring trip');
  });

  it('collectionsService.byTitle finds an exact match after create', async () => {
    await collectionsService.create({
      title: 'Summer beach',
      description: null,
      occurredOn: '2026-06-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [{ fileKey: 'k-s', width: 1000, height: 800, caption: null, takenAt: null, tags: [] }],
    });
    const res = await collectionsService.byTitle('Summer beach');
    expect(res.collection).not.toBeNull();
    expect(res.collection?.title).toBe('Summer beach');
  });

  it('collectionsService.append adds photos to an existing collection', async () => {
    const created = await collectionsService.create({
      title: 'Birthday',
      description: null,
      occurredOn: '2026-07-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [{ fileKey: 'k-a', width: 1000, height: 800, caption: null, takenAt: null, tags: [] }],
    });
    const after = await collectionsService.append(created.id, {
      photos: [
        { fileKey: 'k-b', width: 1000, height: 800, caption: null, takenAt: null, tags: [] },
        { fileKey: 'k-c', width: 1000, height: 800, caption: null, takenAt: null, tags: [] },
      ],
      extraTags: ['庆祝'],
    });
    expect(after.photos.length).toBe(3);
  });
});
