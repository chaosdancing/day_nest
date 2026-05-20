import type { PrismaClient } from '@prisma/client';
import type { CollectionCreateInput } from '@daynest/shared';
import { upsertTags } from './tags.js';

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
        data: { coverPhotoId: photos[0]!.id },
      });
    }

    return collection.id;
  });
}
