import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

async function makeAuth(ctx: Awaited<ReturnType<typeof buildApp>>, username = 'a') {
  const u = await ctx.prisma.user.create({
    data: { username, displayName: username.toUpperCase(), passwordHash: 'x' },
  });
  const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
  return { user: u, token };
}

async function makePhoto(
  ctx: Awaited<ReturnType<typeof buildApp>>,
  userId: string,
  fileKey = 'photos/a.jpg'
) {
  const id = await createCollection(ctx.prisma, userId, {
    title: '集合',
    description: null,
    occurredOn: '2024-01-01',
    occurredUntil: null,
    location: null,
    tags: [],
    photos: [
      {
        fileKey,
        width: 100,
        height: 100,
        caption: null,
        takenAt: null,
        tags: [],
      },
    ],
  });
  const p = await ctx.prisma.photo.findFirstOrThrow({
    where: { collectionId: id },
  });
  return { collectionId: id, photo: p };
}

describe('favorites', () => {
  it('POST /api/photos/:id/favorite marks the photo as favorited by user', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuth(ctx);
    const { photo } = await makePhoto(ctx, user.id);

    const r = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.favoritedByMe).toBe(true);
    expect(body.favoriteCount).toBe(1);

    const persisted = await ctx.prisma.photoFavorite.findMany({});
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.userId).toBe(user.id);

    await ctx.cleanup();
  });

  it('POST is idempotent', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuth(ctx);
    const { photo } = await makePhoto(ctx, user.id);

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    const r2 = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().favoriteCount).toBe(1);

    await ctx.cleanup();
  });

  it('DELETE /api/photos/:id/favorite removes the favorite', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuth(ctx);
    const { photo } = await makePhoto(ctx, user.id);

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    const r = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().favoritedByMe).toBe(false);
    expect(r.json().favoriteCount).toBe(0);
    const persisted = await ctx.prisma.photoFavorite.findMany({});
    expect(persisted).toHaveLength(0);

    await ctx.cleanup();
  });

  it('GET /api/favorites returns favorited photos with actor info', async () => {
    const ctx = await buildApp();
    const { user: alice, token: aliceToken } = await makeAuth(ctx, 'alice');
    const { user: bob, token: bobToken } = await makeAuth(ctx, 'bob');
    const { photo } = await makePhoto(ctx, alice.id);

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${bobToken}` },
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/favorites',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.items).toHaveLength(1);
    const entry = body.items[0];
    expect(entry.photo.id).toBe(photo.id);
    expect(entry.photo.favoriteCount).toBe(2);
    expect(entry.photo.favoritedByMe).toBe(true);
    expect(entry.favoritedBy).toHaveLength(2);
    const usernames = entry.favoritedBy.map(
      (f: { username: string }) => f.username
    );
    expect(usernames).toContain('alice');
    expect(usernames).toContain('bob');
    expect(entry.myFavoritedAt).not.toBeNull();
    expect(entry.collection.id).toBe(photo.collectionId);

    await ctx.cleanup();
  });

  it('GET /api/favorites only includes photos current user favorited', async () => {
    const ctx = await buildApp();
    const { user: alice, token: aliceToken } = await makeAuth(ctx, 'alice');
    const { token: bobToken } = await makeAuth(ctx, 'bob');
    const { photo: p1 } = await makePhoto(ctx, alice.id, 'photos/1.jpg');
    const { photo: p2 } = await makePhoto(ctx, alice.id, 'photos/2.jpg');

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${p1.id}/favorite`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${p2.id}/favorite`,
      headers: { authorization: `Bearer ${bobToken}` },
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: '/api/favorites',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    const body = r.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].photo.id).toBe(p1.id);

    await ctx.cleanup();
  });

  it('collection detail reflects favorite status for current user', async () => {
    const ctx = await buildApp();
    const { user: alice, token: aliceToken } = await makeAuth(ctx, 'alice');
    const { token: bobToken } = await makeAuth(ctx, 'bob');
    const { collectionId, photo } = await makePhoto(ctx, alice.id);

    await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/${photo.id}/favorite`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    const r = await ctx.app.inject({
      method: 'GET',
      url: `/api/collections/${collectionId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    const body = r.json();
    expect(body.photos[0].favoriteCount).toBe(1);
    expect(body.photos[0].favoritedByMe).toBe(false);

    const r2 = await ctx.app.inject({
      method: 'GET',
      url: `/api/collections/${collectionId}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    const body2 = r2.json();
    expect(body2.photos[0].favoritedByMe).toBe(true);

    await ctx.cleanup();
  });

  it('returns 404 favoriting a missing photo', async () => {
    const ctx = await buildApp();
    const { token } = await makeAuth(ctx);
    const r = await ctx.app.inject({
      method: 'POST',
      url: `/api/photos/00000000-0000-0000-0000-000000000000/favorite`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(404);
    await ctx.cleanup();
  });
});
