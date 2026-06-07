import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { upsertTags } from '../services/tags.js';
import { buildPhotoDtoById } from '../services/photoView.js';

const Body = z.object({
  caption: z.string().max(2000).nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
});

export async function registerPhotoRoutes(app: FastifyInstance) {
  app.get(
    '/api/photos/:id/url',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { id } = req.params as { id: string };
      const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
      if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');
      return {
        url: app.deps.storage.signDownload(photo.fileKey, 3600),
        expiresIn: 3600,
      };
    }
  );

  app.patch(
    '/api/photos/:id',
    { onRequest: [app.requireUploader] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
      }
      const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
      if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');

      await app.deps.prisma.$transaction(async (tx) => {
        await tx.photo.update({
          where: { id },
          data: {
            ...(parsed.data.caption !== undefined
              ? { caption: parsed.data.caption }
              : {}),
            ...(parsed.data.orderIndex !== undefined
              ? { orderIndex: parsed.data.orderIndex }
              : {}),
          },
        });

        if (parsed.data.tags === undefined) return;

        const newTags = await upsertTags(tx, req.user.id, parsed.data.tags);
        await tx.photoTag.deleteMany({ where: { photoId: id } });
        if (newTags.length > 0) {
          await tx.photoTag.createMany({
            data: newTags.map((t) => ({ photoId: id, tagId: t.id })),
          });
        }

        // Tag-inheritance shortcut: when the parent collection has no
        // direct tags of its own, lift the (non-empty) photo tags up to
        // the collection level. This matches user expectation that
        // "tagging a photo inside an untagged collection should also
        // surface that tag at the collection level for filtering".
        //
        // We intentionally do NOT touch collection tags when the
        // collection already has any direct tags — the user has clearly
        // expressed intent there, so a photo-level edit shouldn't
        // silently fan out.
        //
        // We also don't remove collection tags when the photo's tag
        // list is reduced to empty: removal at the photo level is a
        // narrower edit than collection-wide untagging.
        if (newTags.length === 0) return;
        const existingCollectionTagCount = await tx.collectionTag.count({
          where: { collectionId: photo.collectionId },
        });
        if (existingCollectionTagCount > 0) return;
        // createMany with skipDuplicates is unsupported on SQLite, so
        // diff-then-insert to stay safe across providers.
        const alreadyOn = await tx.collectionTag.findMany({
          where: {
            collectionId: photo.collectionId,
            tagId: { in: newTags.map((t) => t.id) },
          },
          select: { tagId: true },
        });
        const have = new Set(alreadyOn.map((c) => c.tagId));
        const toAdd = newTags.filter((t) => !have.has(t.id));
        if (toAdd.length > 0) {
          await tx.collectionTag.createMany({
            data: toAdd.map((t) => ({
              collectionId: photo.collectionId,
              tagId: t.id,
            })),
          });
        }
      });

      return buildPhotoDtoById(
        app.deps.prisma,
        app.deps.storage,
        id,
        req.user.id
      );
    }
  );

  app.post(
    '/api/photos/:id/favorite',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { id } = req.params as { id: string };
      const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
      if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');
      await app.deps.prisma.photoFavorite.upsert({
        where: { photoId_userId: { photoId: id, userId: req.user.id } },
        create: { photoId: id, userId: req.user.id },
        update: {},
      });
      return buildPhotoDtoById(
        app.deps.prisma,
        app.deps.storage,
        id,
        req.user.id
      );
    }
  );

  app.delete(
    '/api/photos/:id/favorite',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { id } = req.params as { id: string };
      const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
      if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');
      await app.deps.prisma.photoFavorite.deleteMany({
        where: { photoId: id, userId: req.user.id },
      });
      return buildPhotoDtoById(
        app.deps.prisma,
        app.deps.storage,
        id,
        req.user.id
      );
    }
  );

  app.delete(
    '/api/photos/:id',
    { onRequest: [app.requireUploader] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
      if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');

      // Wrap cover-reassignment, row delete, and the denormalized
      // photoCount decrement in a single transaction so an interrupted
      // request can't leave the cached count out of sync with reality.
      await app.deps.prisma.$transaction(async (tx) => {
        const collection = await tx.collection.findUnique({
          where: { id: photo.collectionId },
          select: { coverPhotoId: true },
        });
        if (collection?.coverPhotoId === photo.id) {
          const next = await tx.photo.findFirst({
            where: { collectionId: photo.collectionId, id: { not: photo.id } },
            orderBy: { orderIndex: 'asc' },
            select: { id: true },
          });
          await tx.collection.update({
            where: { id: photo.collectionId },
            data: {
              coverPhotoId: next?.id ?? null,
              photoCount: { decrement: 1 },
            },
          });
        } else {
          await tx.collection.update({
            where: { id: photo.collectionId },
            data: { photoCount: { decrement: 1 } },
          });
        }
        await tx.photo.delete({ where: { id } });
      });

      await app.deps.storage.deleteObject(photo.fileKey).catch(() => {});
      reply.status(204).send();
    }
  );
}
