import type { PrismaClient } from '@prisma/client';
import type { StorageProvider } from '../storage/provider.js';
import type { PhotoDTO } from '@daynest/shared';
import { AppError } from '../lib/errors.js';

export async function buildPhotoDtoById(
  prisma: PrismaClient,
  storage: StorageProvider,
  photoId: string,
  currentUserId?: string
): Promise<PhotoDTO> {
  const p = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      tags: { include: { tag: true } },
      favorites: { select: { userId: true } },
    },
  });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'photo not found');
  return {
    id: p.id,
    collectionId: p.collectionId,
    fileKey: p.fileKey,
    width: p.width,
    height: p.height,
    caption: p.caption,
    takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    orderIndex: p.orderIndex,
    uploadedBy: p.uploadedById,
    thumbnailUrl: storage.signThumbnail(p.fileKey, 800),
    tags: p.tags.map((pt) => pt.tag.displayName),
    favoriteCount: p.favorites.length,
    favoritedByMe: currentUserId
      ? p.favorites.some((f) => f.userId === currentUserId)
      : false,
  };
}
