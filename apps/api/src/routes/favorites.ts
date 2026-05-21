import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { buildPhotoDtoById } from '../services/photoView.js';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(30),
  cursor: z.string().optional(),
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

      const where: Prisma.PhotoFavoriteWhereInput = {
        userId: req.user.id,
      };
      if (q.cursor) {
        const c = decodeCursor(q.cursor);
        if (c) {
          where.OR = [
            { createdAt: { lt: new Date(c.createdAt) } },
            {
              createdAt: new Date(c.createdAt),
              photoId: { lt: c.photoId },
            },
          ];
        }
      }

      const rows = await app.deps.prisma.photoFavorite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { photoId: 'desc' }],
        take: q.limit + 1,
        select: { photoId: true, createdAt: true },
      });
      const hasMore = rows.length > q.limit;
      const sliced = hasMore ? rows.slice(0, q.limit) : rows;

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
