import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

async function makeAuthedUser(
  ctx: Awaited<ReturnType<typeof buildApp>>,
  username = 'a'
) {
  const u = await ctx.prisma.user.create({
    data: { username, displayName: username.toUpperCase(), passwordHash: 'x' },
  });
  const token = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
  return { user: u, token };
}

describe('PATCH /api/tags/:name', () => {
  it('renames a tag, keeping the same photos/collections attached', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuthedUser(ctx);

    const cid = await createCollection(ctx.prisma, user.id, {
      title: 'trip',
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
          tags: ['樱花'],
        },
      ],
    });

    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/${encodeURIComponent('樱花')}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: '春天的樱花' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.name).toBe('春天的樱花');
    expect(body.displayName).toBe('春天的樱花');
    expect(body.merged).toBe(false);

    // Old name no longer exists; new name shows on the collection + photo.
    const oldTag = await ctx.prisma.tag.findUnique({
      where: { name: '樱花' },
    });
    expect(oldTag).toBeNull();
    const detail = await ctx.app.inject({
      method: 'GET',
      url: `/api/collections/${cid}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const detailBody = detail.json();
    expect(detailBody.tags.map((t: { name: string }) => t.name)).toEqual([
      '春天的樱花',
    ]);
    // Photo `tags` is a list of display labels.
    expect(detailBody.photos[0].tags).toEqual(['春天的樱花']);

    await ctx.cleanup();
  });

  it('only updates the display label when the canonical name is unchanged', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuthedUser(ctx);
    await createCollection(ctx.prisma, user.id, {
      title: 'trip',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['Sakura'],
      photos: [],
    });

    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/${encodeURIComponent('sakura')}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'SAKURA' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    // Canonical name stays the same (case-folded), display flips to uppercase.
    expect(body.name).toBe('sakura');
    expect(body.displayName).toBe('SAKURA');
    expect(body.merged).toBe(false);

    await ctx.cleanup();
  });

  it('merges into an existing tag when the new name collides', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuthedUser(ctx);

    // Collection 1: tagged "猫"
    const c1 = await createCollection(ctx.prisma, user.id, {
      title: 'cats',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['猫'],
      photos: [
        {
          fileKey: 'cat.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: ['猫'],
        },
      ],
    });
    // Collection 2: tagged "kitty" (will be merged into 猫)
    const c2 = await createCollection(ctx.prisma, user.id, {
      title: 'kitties',
      description: null,
      occurredOn: '2024-02-01',
      occurredUntil: null,
      location: null,
      tags: ['kitty'],
      photos: [
        {
          fileKey: 'kitty.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: ['kitty'],
        },
      ],
    });

    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/${encodeURIComponent('kitty')}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: '猫' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.name).toBe('猫');
    expect(body.merged).toBe(true);
    // After the merge: both collections + both photos point to the same tag.
    expect(body.collectionCount).toBe(2);
    expect(body.photoCount).toBe(2);

    // The old `kitty` tag is gone.
    const old = await ctx.prisma.tag.findUnique({ where: { name: 'kitty' } });
    expect(old).toBeNull();

    const list = await ctx.app.inject({
      method: 'GET',
      url: `/api/collections?tag=${encodeURIComponent('猫')}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const listBody = list.json();
    const ids = listBody.items.map((it: { id: string }) => it.id).sort();
    expect(ids).toEqual([c1, c2].sort());

    await ctx.cleanup();
  });

  it('merge handles overlapping links without violating composite PK', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuthedUser(ctx);

    // Collection has BOTH tags applied — we then merge `b` → `a`. The
    // existing (collection, a) link must be preserved without erroring.
    await createCollection(ctx.prisma, user.id, {
      title: 'overlap',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['a', 'b'],
      photos: [
        {
          fileKey: 'p.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: ['a', 'b'],
        },
      ],
    });

    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/b`,
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'a' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.name).toBe('a');
    expect(body.merged).toBe(true);
    expect(body.collectionCount).toBe(1);
    expect(body.photoCount).toBe(1);

    await ctx.cleanup();
  });

  it('rejects empty new names', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuthedUser(ctx);
    await createCollection(ctx.prisma, user.id, {
      title: 't',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['x'],
      photos: [],
    });
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/x`,
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: '   ' },
    });
    expect(r.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('returns 404 for unknown tag names', async () => {
    const ctx = await buildApp();
    const { token } = await makeAuthedUser(ctx);
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/${encodeURIComponent('does-not-exist')}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'new' },
    });
    expect(r.statusCode).toBe(404);
    await ctx.cleanup();
  });

  it('requires authentication', async () => {
    const ctx = await buildApp();
    const r = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/x`,
      payload: { displayName: 'y' },
    });
    expect(r.statusCode).toBe(401);
    await ctx.cleanup();
  });
});

describe('DELETE /api/tags/:name', () => {
  it('removes a tag and its links but keeps photos/collections', async () => {
    const ctx = await buildApp();
    const { user, token } = await makeAuthedUser(ctx);
    const cid = await createCollection(ctx.prisma, user.id, {
      title: 't',
      description: null,
      occurredOn: '2024-01-01',
      occurredUntil: null,
      location: null,
      tags: ['drop'],
      photos: [
        {
          fileKey: 'p.jpg',
          width: 1,
          height: 1,
          caption: null,
          takenAt: null,
          tags: ['drop'],
        },
      ],
    });
    const r = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/tags/drop',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(204);
    const gone = await ctx.prisma.tag.findUnique({ where: { name: 'drop' } });
    expect(gone).toBeNull();
    const c = await ctx.prisma.collection.findUnique({ where: { id: cid } });
    expect(c).not.toBeNull();
    await ctx.cleanup();
  });
});
