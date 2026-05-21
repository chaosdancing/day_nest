import type { PrismaClient } from '@prisma/client';
import type { CollectionAppendInput, CollectionCreateInput } from '@daynest/shared';
import { upsertTags } from './tags.js';
import { AppError } from '../lib/errors.js';

export async function createCollection(
  prisma: PrismaClient,
  userId: string,
  input: CollectionCreateInput
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const collection = await tx.collection.create({
      data: {
        title: input.title,
        description: input.description,
        occurredOn: new Date(input.occurredOn),
        occurredUntil: input.occurredUntil ? new Date(input.occurredUntil) : null,
        location: input.location,
        createdById: userId,
      },
    });

    const collectionTags = await upsertTags(tx, userId, input.tags);
    if (collectionTags.length > 0) {
      await tx.collectionTag.createMany({
        data: collectionTags.map((t) => ({
          collectionId: collection.id,
          tagId: t.id,
        })),
      });
    }

    const photos = await Promise.all(
      input.photos.map(async (p, idx) => {
        const photo = await tx.photo.create({
          data: {
            collectionId: collection.id,
            fileKey: p.fileKey,
            width: p.width,
            height: p.height,
            caption: p.caption,
            takenAt: p.takenAt ? new Date(p.takenAt) : null,
            orderIndex: idx,
            uploadedById: userId,
          },
        });
        if (p.tags.length > 0) {
          const photoTags = await upsertTags(tx, userId, p.tags);
          await tx.photoTag.createMany({
            data: photoTags.map((t) => ({
              photoId: photo.id,
              tagId: t.id,
            })),
          });
        }
        return photo;
      })
    );

    if (photos.length > 0) {
      await tx.collection.update({
        where: { id: collection.id },
        data: {
          coverPhotoId: photos[0]!.id,
          // Persist the photo count alongside the cover assignment so
          // we hit only one extra UPDATE per create.
          photoCount: photos.length,
        },
      });
    }

    return collection.id;
  });
}

export async function appendToCollection(
  prisma: PrismaClient,
  userId: string,
  collectionId: string,
  input: CollectionAppendInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, coverPhotoId: true },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', '集合不存在');
    }

    const lastOrder = await tx.photo.aggregate({
      where: { collectionId },
      _max: { orderIndex: true },
    });
    let nextOrder = (lastOrder._max.orderIndex ?? -1) + 1;

    let assignedCover: { id: string } | null = null;

    for (const p of input.photos) {
      const photo = await tx.photo.create({
        data: {
          collectionId,
          fileKey: p.fileKey,
          width: p.width,
          height: p.height,
          caption: p.caption,
          takenAt: p.takenAt ? new Date(p.takenAt) : null,
          orderIndex: nextOrder,
          uploadedById: userId,
        },
      });
      nextOrder += 1;
      if (!assignedCover) {
        assignedCover = photo;
      }
      if (p.tags.length > 0) {
        const photoTags = await upsertTags(tx, userId, p.tags);
        await tx.photoTag.createMany({
          data: photoTags.map((t) => ({ photoId: photo.id, tagId: t.id })),
        });
      }
    }

    if (input.extraTags.length > 0) {
      const tags = await upsertTags(tx, userId, input.extraTags);
      for (const t of tags) {
        await tx.collectionTag.upsert({
          where: { collectionId_tagId: { collectionId, tagId: t.id } },
          create: { collectionId, tagId: t.id },
          update: {},
        });
      }
    }

    // Bump the denormalized count by however many photos we just
    // appended; coalesce with the cover-assignment write when possible.
    const appendedCount = input.photos.length;
    if (!existing.coverPhotoId && assignedCover) {
      await tx.collection.update({
        where: { id: collectionId },
        data: {
          coverPhotoId: assignedCover.id,
          photoCount: { increment: appendedCount },
        },
      });
    } else if (appendedCount > 0) {
      await tx.collection.update({
        where: { id: collectionId },
        data: { photoCount: { increment: appendedCount } },
      });
    }
  });
}
