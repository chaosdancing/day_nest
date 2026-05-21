import { z } from 'zod';

export const PhotoDTO = z.object({
  id: z.string().uuid(),
  collectionId: z.string().uuid(),
  fileKey: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string().nullable(),
  takenAt: z.string().datetime().nullable(),
  orderIndex: z.number().int(),
  uploadedBy: z.string().uuid(),
  thumbnailUrl: z.string().url(),
  tags: z.array(z.string()).default([]),
  favoriteCount: z.number().int().nonnegative().default(0),
  favoritedByMe: z.boolean().default(false),
});
export type PhotoDTO = z.infer<typeof PhotoDTO>;

export const FavoriteActorDTO = z.object({
  userId: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});
export type FavoriteActorDTO = z.infer<typeof FavoriteActorDTO>;

export const FavoriteEntryDTO = z.object({
  photo: PhotoDTO,
  collection: z.object({
    id: z.string().uuid(),
    title: z.string(),
    occurredOn: z.string(),
  }),
  favoritedBy: z.array(FavoriteActorDTO),
  myFavoritedAt: z.string().datetime().nullable(),
});
export type FavoriteEntryDTO = z.infer<typeof FavoriteEntryDTO>;

export const FavoritesListResponse = z.object({
  items: z.array(FavoriteEntryDTO),
  nextCursor: z.string().nullable(),
});
export type FavoritesListResponse = z.infer<typeof FavoritesListResponse>;

export const PhotoInput = z.object({
  fileKey: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string().max(2000).nullable().default(null),
  takenAt: z.string().datetime().nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
});
export type PhotoInput = z.infer<typeof PhotoInput>;
