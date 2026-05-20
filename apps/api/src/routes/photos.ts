import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { upsertTags } from '../services/tags.js';

const Body = z.object({
  caption: z.string().max(2000).nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
});

export async function registerPhotoRoutes(app: FastifyInstance) {
  app.patch(
    '/api/photos/:id',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
      }
      const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
      if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');
      await app.deps.prisma.photo.update({
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
      if (parsed.data.tags !== undefined) {
        const newTags = await upsertTags(
          app.deps.prisma,
          req.user.id,
          parsed.data.tags
        );
        await app.deps.prisma.photoTag.deleteMany({ where: { photoId: id } });
        if (newTags.length > 0) {
          await app.deps.prisma.photoTag.createMany({
            data: newTags.map((t) => ({ photoId: id, tagId: t.id })),
          });
        }
      }
      const updated = await app.deps.prisma.photo.findUniqueOrThrow({
        where: { id },
        include: { tags: { include: { tag: true } } },
      });
      return {
        id: updated.id,
        collectionId: updated.collectionId,
        fileKey: updated.fileKey,
        width: updated.width,
        height: updated.height,
        caption: updated.caption,
        takenAt: updated.takenAt?.toISOString() ?? null,
        orderIndex: updated.orderIndex,
        uploadedBy: updated.uploadedById,
        thumbnailUrl: app.deps.storage.signThumbnail(updated.fileKey, 800),
        tags: updated.tags.map((pt) => pt.tag.displayName),
      };
    }
  );

  app.delete(
    '/api/photos/:id',
    { onRequest: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
      if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');
      const collection = await app.deps.prisma.collection.findUnique({
        where: { id: photo.collectionId },
        select: { coverPhotoId: true },
      });
      if (collection?.coverPhotoId === photo.id) {
        const next = await app.deps.prisma.photo.findFirst({
          where: { collectionId: photo.collectionId, id: { not: photo.id } },
          orderBy: { orderIndex: 'asc' },
          select: { id: true },
        });
        await app.deps.prisma.collection.update({
          where: { id: photo.collectionId },
          data: { coverPhotoId: next?.id ?? null },
        });
      }
      await app.deps.prisma.photo.delete({ where: { id } });
      await app.deps.storage.deleteObject(photo.fileKey).catch(() => {});
      reply.status(204).send();
    }
  );
}
