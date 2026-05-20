import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CollectionCreateInput, CollectionUpdateInput } from '@daynest/shared';
import { createCollection } from '../services/collections.js';
import { upsertTags } from '../services/tags.js';
import {
  buildCollectionDetail,
  buildCollectionSummary,
} from '../services/collectionView.js';
import { AppError } from '../lib/errors.js';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  tag: z.string().optional(),
});

type Cursor = { occurredOn: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(s: string): Cursor | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(s, 'base64url').toString('utf-8')
    ) as Cursor;
    if (typeof decoded.occurredOn !== 'string' || typeof decoded.id !== 'string') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export async function registerCollectionRoutes(app: FastifyInstance) {
  app.post(
    '/api/collections',
    { onRequest: [app.requireUser] },
    async (req, reply) => {
      const parsed = CollectionCreateInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join('; ')
        );
      }
      const id = await createCollection(
        app.deps.prisma,
        req.user.id,
        parsed.data
      );
      const dto = await buildCollectionDetail(
        app.deps.prisma,
        app.deps.storage,
        id
      );
      reply.status(201);
      return dto;
    }
  );

  app.get(
    '/api/collections',
    { onRequest: [app.requireUser] },
    async (req) => {
      const q = ListQuery.parse(req.query);
      let tagFilterClause: { collectionId: string }[] | null = null;
      if (q.tag) {
        const t = await app.deps.prisma.tag.findUnique({
          where: { name: q.tag.toLocaleLowerCase().trim() },
        });
        if (!t) return { items: [], nextCursor: null };
        const direct = await app.deps.prisma.collectionTag.findMany({
          where: { tagId: t.id },
          select: { collectionId: true },
        });
        const viaPhoto = await app.deps.prisma.photo.findMany({
          where: { tags: { some: { tagId: t.id } } },
          select: { collectionId: true },
          distinct: ['collectionId'],
        });
        const ids = Array.from(
          new Set([
            ...direct.map((d) => d.collectionId),
            ...viaPhoto.map((v) => v.collectionId),
          ])
        );
        if (ids.length === 0) return { items: [], nextCursor: null };
        tagFilterClause = ids.map((id) => ({ collectionId: id }));
      }

      const where: Parameters<typeof app.deps.prisma.collection.findMany>[0] extends infer T
        ? T extends { where?: infer W }
          ? W & object
          : never
        : never = {};
      if (tagFilterClause) {
        (where as { id?: { in: string[] } }).id = {
          in: tagFilterClause.map((c) => c.collectionId),
        };
      }
      if (q.cursor) {
        const c = decodeCursor(q.cursor);
        if (c) {
          (where as Record<string, unknown>).OR = [
            { occurredOn: { lt: new Date(c.occurredOn) } },
            {
              occurredOn: new Date(c.occurredOn),
              id: { lt: c.id },
            },
          ];
        }
      }
      const rows = await app.deps.prisma.collection.findMany({
        where,
        orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        select: { id: true, occurredOn: true },
      });
      const hasMore = rows.length > q.limit;
      const sliced = hasMore ? rows.slice(0, q.limit) : rows;
      const items = await Promise.all(
        sliced.map((r) =>
          buildCollectionSummary(app.deps.prisma, app.deps.storage, r.id)
        )
      );
      const last = sliced[sliced.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({
              occurredOn: last.occurredOn.toISOString(),
              id: last.id,
            })
          : null;
      return { items, nextCursor };
    }
  );

  app.get(
    '/api/collections/:id',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { id } = req.params as { id: string };
      try {
        return await buildCollectionDetail(
          app.deps.prisma,
          app.deps.storage,
          id
        );
      } catch {
        throw new AppError(404, 'NOT_FOUND', 'collection not found');
      }
    }
  );

  app.patch(
    '/api/collections/:id',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = CollectionUpdateInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
      }
      const { tags, coverPhotoId, ...rest } = parsed.data;
      await app.deps.prisma.collection.update({
        where: { id },
        data: {
          ...(rest.title !== undefined ? { title: rest.title } : {}),
          ...(rest.description !== undefined
            ? { description: rest.description }
            : {}),
          ...(rest.occurredOn !== undefined
            ? { occurredOn: new Date(rest.occurredOn) }
            : {}),
          ...(rest.occurredUntil !== undefined
            ? {
                occurredUntil: rest.occurredUntil
                  ? new Date(rest.occurredUntil)
                  : null,
              }
            : {}),
          ...(rest.location !== undefined ? { location: rest.location } : {}),
          ...(coverPhotoId ? { coverPhotoId } : {}),
        },
      });
      if (tags !== undefined) {
        const newTags = await upsertTags(app.deps.prisma, req.user.id, tags);
        await app.deps.prisma.collectionTag.deleteMany({
          where: { collectionId: id },
        });
        if (newTags.length > 0) {
          await app.deps.prisma.collectionTag.createMany({
            data: newTags.map((t) => ({ collectionId: id, tagId: t.id })),
          });
        }
      }
      return buildCollectionDetail(app.deps.prisma, app.deps.storage, id);
    }
  );

  app.delete(
    '/api/collections/:id',
    { onRequest: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const photos = await app.deps.prisma.photo.findMany({
        where: { collectionId: id },
        select: { fileKey: true },
      });
      await app.deps.prisma.collection.update({
        where: { id },
        data: { coverPhotoId: null },
      });
      await app.deps.prisma.collection.delete({ where: { id } });
      await Promise.allSettled(
        photos.map((p) => app.deps.storage.deleteObject(p.fileKey))
      );
      reply.status(204).send();
    }
  );
}
