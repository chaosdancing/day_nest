import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { buildPhotoDtoById } from '../services/photoView.js';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(30),
  cursor: z.string().optional(),
  // 'all'  → every photo any family member has favorited (the shared "loved"
  //          wall; each entry's favoritedBy names who loved it).
  // 'mine' → only the current user's own favorites.
  // Defaults to 'all' so the page reads as a family-shared favorites wall, with
  // a client-side "只看我的" toggle narrowing to scope=mine.
  scope: z.enum(['all', 'mine']).default('all'),
});

type Cursor = { createdAt: string; photoId: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(s: string): Cursor | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(s, 'base64url').toString('utf-8')
    ) as Cursor;
    if (
      typeof decoded.createdAt !== 'string' ||
      typeof decoded.photoId !== 'string'
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export async function registerFavoritesRoutes(app: FastifyInstance) {
  app.get(
    '/api/favorites',
    { onRequest: [app.requireUser] },
    async (req) => {
      const q = ListQuery.parse(req.query);
      const cursor = q.cursor ? decodeCursor(q.cursor) : null;

      // Both scopes resolve to the same shape: a page of { photoId, createdAt }
      // ordered by favorite recency (desc), keyed for cursor pagination. 'mine'
      // pages raw favorite rows; 'all' collapses to distinct photos keyed by
      // each photo's most-recent favorite time.
      let sliced: Array<{ photoId: string; createdAt: Date }>;
      let hasMore: boolean;

      if (q.scope === 'mine') {
        const where: Prisma.PhotoFavoriteWhereInput = { userId: req.user.id };
        if (cursor) {
          where.OR = [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), photoId: { lt: cursor.photoId } },
          ];
        }
        const rows = await app.deps.prisma.photoFavorite.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { photoId: 'desc' }],
          take: q.limit + 1,
          select: { photoId: true, createdAt: true },
        });
        hasMore = rows.length > q.limit;
        sliced = hasMore ? rows.slice(0, q.limit) : rows;
      } else {
        // Distinct photos favorited by anyone, ordered by their latest favorite.
        // Family-scale data, so we group the full set and paginate in-memory; a
        // photo's many favorite rows can't be cursor-filtered at the DB layer
        // without dropping its true max(createdAt).
        const groups = await app.deps.prisma.photoFavorite.groupBy({
          by: ['photoId'],
          _max: { createdAt: true },
          orderBy: [{ _max: { createdAt: 'desc' } }, { photoId: 'desc' }],
        });
        let entries = groups.map((g) => ({
          photoId: g.photoId,
          createdAt: g._max.createdAt as Date,
        }));
        if (cursor) {
          const cd = new Date(cursor.createdAt).getTime();
          entries = entries.filter((e) => {
            const t = e.createdAt.getTime();
            return t < cd || (t === cd && e.photoId < cursor.photoId);
          });
        }
        hasMore = entries.length > q.limit;
        sliced = hasMore ? entries.slice(0, q.limit) : entries;
      }

      const items = await Promise.all(
        sliced.map(async (row) => {
          const photoDto = await buildPhotoDtoById(
            app.deps.prisma,
            app.deps.storage,
            row.photoId,
            req.user.id
          );
          const photo = await app.deps.prisma.photo.findUniqueOrThrow({
            where: { id: row.photoId },
            include: {
              collection: { select: { id: true, title: true, occurredOn: true } },
              favorites: {
                include: {
                  user: { select: { id: true, username: true, displayName: true } },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          });
          const favoritedBy = photo.favorites.map((f) => ({
            userId: f.user.id,
            username: f.user.username,
            displayName: f.user.displayName,
            createdAt: f.createdAt.toISOString(),
          }));
          const mine = photo.favorites.find((f) => f.user.id === req.user.id);
          return {
            photo: photoDto,
            collection: {
              id: photo.collection.id,
              title: photo.collection.title,
              occurredOn: photo.collection.occurredOn.toISOString().slice(0, 10),
            },
            favoritedBy,
            myFavoritedAt: mine ? mine.createdAt.toISOString() : null,
          };
        })
      );

      const last = sliced[sliced.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt.toISOString(),
              photoId: last.photoId,
            })
          : null;
      return { items, nextCursor };
    }
  );
}
