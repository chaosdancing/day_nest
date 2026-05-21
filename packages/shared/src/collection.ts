import { z } from 'zod';
import { PhotoDTO, PhotoInput } from './photo.js';
import { TagDTO } from './tag.js';

export const CollectionCreateInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).nullable().default(null),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  occurredUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .nullable()
    .default(null),
  location: z.string().max(200).nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
  photos: z.array(PhotoInput).min(1).max(200),
});
export type CollectionCreateInput = z.infer<typeof CollectionCreateInput>;

export const CollectionUpdateInput = CollectionCreateInput
  .omit({ photos: true })
  .extend({ coverPhotoId: z.string().uuid().optional() })
  .partial();
export type CollectionUpdateInput = z.infer<typeof CollectionUpdateInput>;

export const CollectionSummaryDTO = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  occurredOn: z.string(),
  occurredUntil: z.string().nullable(),
  location: z.string().nullable(),
  coverPhoto: PhotoDTO.nullable(),
  // Up to 3 representative photos (cover first, then next two by order).
  // Used by list views (tag pinboard, timeline) to render a "stack" of
  // overlapping polaroids instead of a single cover.
  previewPhotos: z.array(PhotoDTO).max(3),
  tags: z.array(TagDTO),
  photoCount: z.number().int().nonnegative(),
  createdBy: z.string().uuid(),
});
export type CollectionSummaryDTO = z.infer<typeof CollectionSummaryDTO>;

export const CollectionDetailDTO = CollectionSummaryDTO.extend({
  photos: z.array(PhotoDTO),
});
export type CollectionDetailDTO = z.infer<typeof CollectionDetailDTO>;

export const CollectionAppendInput = z.object({
  photos: z.array(PhotoInput).min(1).max(200),
  extraTags: z.array(z.string().min(1).max(40)).default([]),
});
export type CollectionAppendInput = z.infer<typeof CollectionAppendInput>;
