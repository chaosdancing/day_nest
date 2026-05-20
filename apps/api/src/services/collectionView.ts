import type { PrismaClient } from '@prisma/client';
import type { StorageProvider } from '../storage/provider.js';
import type {
  CollectionSummaryDTO,
  CollectionDetailDTO,
  PhotoDTO,
  TagDTO,
} from '@daynest/shared';

type PhotoWithTags = {
  id: string;
  collectionId: string;
  fileKey: string;
  width: number;
  height: number;
  caption: string | null;
  takenAt: Date | null;
  orderIndex: number;
  uploadedById: string;
  tags: Array<{
    tag: { id: string; name: string; displayName: string };
  }>;
};

function tagDto(t: { id: string; name: string; displayName: string }): TagDTO {
  return { id: t.id, name: t.name, displayName: t.displayName };
}

function photoDto(p: PhotoWithTags, storage: StorageProvider): PhotoDTO {
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
  };
}

export async function buildCollectionDetail(
  prisma: PrismaClient,
  storage: StorageProvider,
  id: string
): Promise<CollectionDetailDTO> {
  const c = await prisma.collection.findUniqueOrThrow({
    where: { id },
    include: {
      coverPhoto: { include: { tags: { include: { tag: true } } } },
      tags: { include: { tag: true } },
      photos: {
        orderBy: { orderIndex: 'asc' },
        include: { tags: { include: { tag: true } } },
      },
    },
  });
  const tagSet = new Map<string, TagDTO>();
  c.tags.forEach((ct) => tagSet.set(ct.tag.id, tagDto(ct.tag)));
  c.photos.forEach((p) =>
    p.tags.forEach((pt) => tagSet.set(pt.tag.id, tagDto(pt.tag)))
  );
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    occurredOn: c.occurredOn.toISOString().slice(0, 10),
    occurredUntil: c.occurredUntil ? c.occurredUntil.toISOString().slice(0, 10) : null,
    location: c.location,
    coverPhoto: c.coverPhoto ? photoDto(c.coverPhoto, storage) : null,
    tags: Array.from(tagSet.values()),
    photoCount: c.photos.length,
    createdBy: c.createdById,
    photos: c.photos.map((p) => photoDto(p, storage)),
  };
}

export async function buildCollectionSummary(
  prisma: PrismaClient,
  storage: StorageProvider,
  id: string
): Promise<CollectionSummaryDTO> {
  const detail = await buildCollectionDetail(prisma, storage, id);
  const { photos: _photos, ...rest } = detail;
  return rest;
}
