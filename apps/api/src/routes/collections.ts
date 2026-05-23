import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CollectionAppendInput,
  CollectionCreateInput,
  CollectionUpdateInput,
} from '@daynest/shared';
import { appendToCollection, createCollection } from '../services/collections.js';
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
  // How to interpret the `tag` filter:
  //   - 'any' / 'all' (default) : a collection matches if it has the tag
  //                               directly OR if any of its photos do.
  //   - 'collection'            : only direct collection-level tags.
  //   - 'photo'                 : only tags applied to at least one of
  //                               the collection's photos.
  // Used by the Tags overview page (web uses 'any') and the miniapp's tag
  // pinboard (uses 'all'); we accept both so both wire formats work.
  tagScope: z
    .enum(['any', 'all', 'collection', 'photo'])
    .default('any')
    .transform((s) => (s === 'all' ? 'any' : s)),
  // Fuzzy `contains` match on collection title (case-insensitive on
  // SQLite — built-in LIKE is already case-insensitive for ASCII; CJK
  // works because we don't apply lower() so contains() does a byte
  // substring search).
  title: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  location: z.string().optional(),
});

type Cursor = { occurredOn: string; id: string };
type TitleMatchType = 'exact' | 'contains' | 'subsequence';

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

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase().replace(/\s+/g, '');
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return false;
  let cursor = 0;
  for (const ch of haystack) {
    if (ch === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return true;
  }
  return false;
}

function scoreTitleMatch(
  query: string,
  title: string
): { score: number; matchType: TitleMatchType } | null {
  const q = normalizeTitle(query);
  const t = normalizeTitle(title);
  if (!q || !t) return null;
  if (q === t) return { score: 100, matchType: 'exact' };
  if (t.includes(q) || q.includes(t)) {
    const overlap = Math.min(q.length, t.length) / Math.max(q.length, t.length);
    return { score: Math.round(70 + overlap * 20), matchType: 'contains' };
  }
  if (isSubsequence(q, t)) {
    const density = q.length / t.length;
    return { score: Math.round(40 + density * 20), matchType: 'subsequence' };
  }
  return null;
}

async function getDirectCollectionTags(
  app: FastifyInstance,
  collectionId: string
): Promise<string[]> {
  const direct = await app.deps.prisma.collectionTag.findMany({
    where: { collectionId },
    include: { tag: true },
  });
  return direct.map((d) => d.tag.displayName);
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
        id,
        req.user.id
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
        const directIds =
          q.tagScope === 'photo'
            ? []
            : (
                await app.deps.prisma.collectionTag.findMany({
                  where: { tagId: t.id },
                  select: { collectionId: true },
                })
              ).map((d) => d.collectionId);
        const photoIds =
          q.tagScope === 'collection'
            ? []
            : (
                await app.deps.prisma.photo.findMany({
                  where: { tags: { some: { tagId: t.id } } },
                  select: { collectionId: true },
                  distinct: ['collectionId'],
                })
              ).map((v) => v.collectionId);
        const ids = Array.from(new Set([...directIds, ...photoIds]));
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
      if (q.dateFrom || q.dateTo) {
        (where as { occurredOn?: { gte?: Date; lte?: Date } }).occurredOn = {
          ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
          ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}),
        };
      }
      if (q.location?.trim()) {
        (where as { location?: { contains: string } }).location = {
          contains: q.location.trim(),
        };
      }
      if (q.title?.trim()) {
        (where as { title?: { contains: string } }).title = {
          contains: q.title.trim(),
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
          buildCollectionSummary(
            app.deps.prisma,
            app.deps.storage,
            r.id,
            req.user.id
          )
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
    '/api/collections/by-title',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { title } = req.query as { title?: string };
      const trimmed = (title ?? '').trim();
      if (!trimmed) {
        throw new AppError(400, 'VALIDATION_ERROR', 'title required');
      }
      const candidates = await app.deps.prisma.collection.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true },
        take: 200,
      });
      const scored = candidates
        .map((c) => {
          const match = scoreTitleMatch(trimmed, c.title);
          return match ? { ...c, ...match } : null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.createdAt.getTime() - a.createdAt.getTime()
        )
        .slice(0, 5);

      const matches = await Promise.all(
        scored.map(async (m) => ({
          collection: await buildCollectionDetail(
            app.deps.prisma,
            app.deps.storage,
            m.id,
            req.user.id
          ),
          directTags: await getDirectCollectionTags(app, m.id),
          score: m.score,
          matchType: m.matchType,
        }))
      );
      const exact = matches.find((m) => m.matchType === 'exact');
      return {
        collection: exact?.collection ?? null,
        directTags: exact?.directTags ?? [],
        matches,
      };
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
          id,
          req.user.id
        );
      } catch {
        throw new AppError(404, 'NOT_FOUND', 'collection not found');
      }
    }
  );

  app.post(
    '/api/collections/:id/append',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = CollectionAppendInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join('; ')
        );
      }
      await appendToCollection(app.deps.prisma, req.user.id, id, parsed.data);
      return buildCollectionDetail(
        app.deps.prisma,
        app.deps.storage,
        id,
        req.user.id
      );
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
      return buildCollectionDetail(
        app.deps.prisma,
        app.deps.storage,
        id,
        req.user.id
      );
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
