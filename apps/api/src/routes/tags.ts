import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { normalizeTagName } from '../services/tags.js';

const TagRenameInput = z.object({
  displayName: z.string().min(1).max(60),
});

/**
 * Resolve a tag by its url-encoded normalized name. Throws 404 if missing.
 */
async function findTagByEncodedName(
  app: FastifyInstance,
  encoded: string
): Promise<{ id: string; name: string; displayName: string }> {
  const decoded = decodeURIComponent(encoded);
  const normalized = normalizeTagName(decoded);
  const t = await app.deps.prisma.tag.findUnique({
    where: { name: normalized },
  });
  if (!t) throw new AppError(404, 'TAG_NOT_FOUND', 'tag not found');
  return t;
}

export async function registerTagRoutes(app: FastifyInstance) {
  app.get('/api/tags', { onRequest: [app.requireUser] }, async () => {
    const tags = await app.deps.prisma.tag.findMany({
      include: {
        _count: { select: { photos: true, collections: true } },
      },
    });
    return tags
      .map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        photoCount: t._count.photos,
        collectionCount: t._count.collections,
      }))
      .sort(
        (a, b) =>
          b.collectionCount + b.photoCount - (a.collectionCount + a.photoCount)
      );
  });

  app.get(
    '/api/tags/:name/photos',
    { onRequest: [app.requireUser] },
    async (req) => {
      const { name } = req.params as { name: string };
      const query = req.query as { limit?: string; cursor?: string };
      const tag = await findTagByEncodedName(app, name);
      const limit = Math.max(1, Math.min(50, Number(query.limit ?? 30) || 30));
      const rows = await app.deps.prisma.photo.findMany({
        where: {
          tags: { some: { tagId: tag.id } },
        },
        include: {
          tags: { include: { tag: true } },
          favorites: { select: { userId: true } },
          collection: {
            select: {
              id: true,
              title: true,
              occurredOn: true,
              location: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((p) => ({
          photo: {
            id: p.id,
            collectionId: p.collectionId,
            fileKey: p.fileKey,
            width: p.width,
            height: p.height,
            caption: p.caption,
            takenAt: p.takenAt ? p.takenAt.toISOString() : null,
            orderIndex: p.orderIndex,
            uploadedBy: p.uploadedById,
            thumbnailUrl: app.deps.storage.signThumbnail(p.fileKey, 800),
            tags: p.tags.map((pt) => pt.tag.displayName),
            favoriteCount: p.favorites.length,
            favoritedByMe: p.favorites.some((f) => f.userId === req.user.id),
          },
          collection: {
            id: p.collection.id,
            title: p.collection.title,
            occurredOn: p.collection.occurredOn.toISOString().slice(0, 10),
            location: p.collection.location,
          },
        })),
        nextCursor: rows.length > limit ? rows[limit]!.id : null,
      };
    }
  );

  /**
   * PATCH /api/tags/:name
   *
   * Rename a tag. `:name` is the current normalized tag name (url-encoded).
   * Body: `{ displayName }` — derive the new normalized name from it. When
   * the new normalized name collides with another existing tag, merge the
   * two tags (move photo/collection links onto the target, then delete the
   * source). All photos and collections that referenced the old tag will
   * therefore reflect the new name without any further mutation.
   */
  app.patch(
    '/api/tags/:name',
    { onRequest: [app.requireUploader] },
    async (req) => {
      const { name } = req.params as { name: string };
      const parsed = TagRenameInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join('; ')
        );
      }
      const source = await findTagByEncodedName(app, name);
      const newDisplay = parsed.data.displayName.trim();
      if (newDisplay.length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'displayName empty');
      }
      const newNormalized = normalizeTagName(newDisplay);

      // Same canonical name: just refresh the display label.
      if (newNormalized === source.name) {
        const updated = await app.deps.prisma.tag.update({
          where: { id: source.id },
          data: { displayName: newDisplay },
          include: { _count: { select: { photos: true, collections: true } } },
        });
        return {
          id: updated.id,
          name: updated.name,
          displayName: updated.displayName,
          photoCount: updated._count.photos,
          collectionCount: updated._count.collections,
          merged: false,
        };
      }

      // Detect a collision with another existing tag → merge into it.
      const collision = await app.deps.prisma.tag.findUnique({
        where: { name: newNormalized },
      });

      const finalId = await app.deps.prisma.$transaction(async (tx) => {
        if (collision) {
          // Move every photo link onto the target tag, skipping any link
          // that already exists (composite primary key uniqueness).
          const photoLinks = await tx.photoTag.findMany({
            where: { tagId: source.id },
            select: { photoId: true },
          });
          if (photoLinks.length > 0) {
            const existingPhoto = await tx.photoTag.findMany({
              where: {
                tagId: collision.id,
                photoId: { in: photoLinks.map((l) => l.photoId) },
              },
              select: { photoId: true },
            });
            const haveP = new Set(existingPhoto.map((e) => e.photoId));
            const toInsertP = photoLinks
              .map((l) => l.photoId)
              .filter((pid) => !haveP.has(pid));
            if (toInsertP.length > 0) {
              await tx.photoTag.createMany({
                data: toInsertP.map((pid) => ({
                  photoId: pid,
                  tagId: collision.id,
                })),
              });
            }
          }
          const collectionLinks = await tx.collectionTag.findMany({
            where: { tagId: source.id },
            select: { collectionId: true },
          });
          if (collectionLinks.length > 0) {
            const existing = await tx.collectionTag.findMany({
              where: {
                tagId: collision.id,
                collectionId: { in: collectionLinks.map((l) => l.collectionId) },
              },
              select: { collectionId: true },
            });
            const have = new Set(existing.map((e) => e.collectionId));
            const toInsert = collectionLinks
              .map((l) => l.collectionId)
              .filter((cid) => !have.has(cid));
            if (toInsert.length > 0) {
              await tx.collectionTag.createMany({
                data: toInsert.map((cid) => ({
                  collectionId: cid,
                  tagId: collision.id,
                })),
              });
            }
          }
          // Drop the now-empty source tag and its (already-migrated) links.
          await tx.photoTag.deleteMany({ where: { tagId: source.id } });
          await tx.collectionTag.deleteMany({ where: { tagId: source.id } });
          await tx.tag.delete({ where: { id: source.id } });
          // Surface the user-typed display label even when merging into an
          // older tag — feels more responsive than silently keeping the
          // collision's original casing.
          await tx.tag.update({
            where: { id: collision.id },
            data: { displayName: newDisplay },
          });
          return collision.id;
        }
        await tx.tag.update({
          where: { id: source.id },
          data: { name: newNormalized, displayName: newDisplay },
        });
        return source.id;
      });

      const final = await app.deps.prisma.tag.findUniqueOrThrow({
        where: { id: finalId },
        include: { _count: { select: { photos: true, collections: true } } },
      });
      return {
        id: final.id,
        name: final.name,
        displayName: final.displayName,
        photoCount: final._count.photos,
        collectionCount: final._count.collections,
        merged: Boolean(collision),
      };
    }
  );

  /**
   * Helper for the rare case where a user actually wants to delete a tag.
   * Cascades remove the join-rows, leaving photos and collections untouched.
   */
  app.delete(
    '/api/tags/:name',
    { onRequest: [app.requireUploader] },
    async (req, reply) => {
      const { name } = req.params as { name: string };
      const t = await findTagByEncodedName(app, name);
      await app.deps.prisma.$transaction([
        app.deps.prisma.photoTag.deleteMany({ where: { tagId: t.id } }),
        app.deps.prisma.collectionTag.deleteMany({ where: { tagId: t.id } }),
        app.deps.prisma.tag.delete({ where: { id: t.id } }),
      ]);
      reply.code(204);
      return null;
    }
  );
}
