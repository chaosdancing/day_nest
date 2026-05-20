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
});
export type PhotoDTO = z.infer<typeof PhotoDTO>;

export const PhotoInput = z.object({
  fileKey: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string().max(2000).nullable().default(null),
  takenAt: z.string().datetime().nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
});
export type PhotoInput = z.infer<typeof PhotoInput>;
