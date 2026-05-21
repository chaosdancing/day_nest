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
  favorites?: Array<{ userId: string }>;
};

function tagDto(t: { id: string; name: string; displayName: string }): TagDTO {
  return { id: t.id, name: t.name, displayName: t.displayName };
}

function photoDto(
  p: PhotoWithTags,
  storage: StorageProvider,
  currentUserId?: string
): PhotoDTO {
  const favorites = p.favorites ?? [];
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
    favoriteCount: favorites.length,
    favoritedByMe: currentUserId
      ? favorites.some((f) => f.userId === currentUserId)
      : false,
  };
}

export async function buildCollectionDetail(
  prisma: PrismaClient,
  storage: StorageProvider,
  id: string,
  currentUserId?: string
): Promise<CollectionDetailDTO> {
  const c = await prisma.collection.findUniqueOrThrow({
    where: { id },
    include: {
      coverPhoto: {
        include: {
          tags: { include: { tag: true } },
          favorites: { select: { userId: true } },
        },
      },
      tags: { include: { tag: true } },
      photos: {
        orderBy: { orderIndex: 'asc' },
        include: {
          tags: { include: { tag: true } },
          favorites: { select: { userId: true } },
        },
      },
    },
  });
  const tagSet = new Map<string, TagDTO>();
  c.tags.forEach((ct) => tagSet.set(ct.tag.id, tagDto(ct.tag)));
  c.photos.forEach((p) =>
    p.tags.forEach((pt) => tagSet.set(pt.tag.id, tagDto(pt.tag)))
  );
  const coverDto = c.coverPhoto
    ? photoDto(c.coverPhoto, storage, currentUserId)
    : null;
  const photoDtos = c.photos.map((p) => photoDto(p, storage, currentUserId));
  // Pick up to 3 representative photos for stacked-preview UIs: cover
  // first (if any), then fill with the earliest-ordered remaining photos,
  // deduping by id so a cover that's also the first photo isn't doubled.
  const seen = new Set<string>();
  const preview: typeof photoDtos = [];
  if (coverDto) {
    preview.push(coverDto);
    seen.add(coverDto.id);
  }
  for (const p of photoDtos) {
    if (preview.length >= 3) break;
    if (seen.has(p.id)) continue;
    preview.push(p);
    seen.add(p.id);
  }
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    occurredOn: c.occurredOn.toISOString().slice(0, 10),
    occurredUntil: c.occurredUntil ? c.occurredUntil.toISOString().slice(0, 10) : null,
    location: c.location,
    coverPhoto: coverDto,
    previewPhotos: preview,
    tags: Array.from(tagSet.values()),
    // Prefer the denormalized count when it matches what we just loaded.
    // If the cached value drifts (legacy data, migration backfill) the
    // detail view will silently self-correct with the in-memory count.
    photoCount: c.photoCount === c.photos.length ? c.photoCount : c.photos.length,
    createdBy: c.createdById,
    photos: photoDtos,
  };
}

/**
 * Lightweight summary used for list endpoints (timeline, by-tag, etc.).
 *
 * Crucially this does NOT load every photo in the collection — only the
 * cover plus up to two additional photos for the stacked-polaroid
 * preview. The total `photoCount` is read from the denormalized column
 * maintained at write-time, so a timeline page with 50 collections of
 * 200 photos each no longer triggers a 10,000-row Photo JOIN.
 *
 * Tag aggregation is also slimmed: only the direct collection-level
 * tags appear here. Photo-level tags don't surface on list cards, so
 * we don't pay to discover them.
 */
export async function buildCollectionSummary(
  prisma: PrismaClient,
  storage: StorageProvider,
  id: string,
  currentUserId?: string
): Promise<CollectionSummaryDTO> {
  const c = await prisma.collection.findUniqueOrThrow({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      coverPhoto: {
        include: {
          tags: { include: { tag: true } },
          favorites: { select: { userId: true } },
        },
      },
      // Cap the join: at most 3 photos, earliest-first. We'll dedupe
      // against the cover below so the resulting preview never doubles
      // the same photo.
      photos: {
        orderBy: { orderIndex: 'asc' },
        take: 3,
        include: {
          tags: { include: { tag: true } },
          favorites: { select: { userId: true } },
        },
      },
    },
  });
  const coverDto = c.coverPhoto
    ? photoDto(c.coverPhoto, storage, currentUserId)
    : null;
  const seen = new Set<string>();
  const preview: PhotoDTO[] = [];
  if (coverDto) {
    preview.push(coverDto);
    seen.add(coverDto.id);
  }
  for (const p of c.photos) {
    if (preview.length >= 3) break;
    if (seen.has(p.id)) continue;
    preview.push(photoDto(p, storage, currentUserId));
    seen.add(p.id);
  }
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    occurredOn: c.occurredOn.toISOString().slice(0, 10),
    occurredUntil: c.occurredUntil ? c.occurredUntil.toISOString().slice(0, 10) : null,
    location: c.location,
    coverPhoto: coverDto,
    previewPhotos: preview,
    tags: c.tags.map((ct) => tagDto(ct.tag)),
    photoCount: c.photoCount,
    createdBy: c.createdById,
  };
}
