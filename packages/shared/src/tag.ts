import { z } from 'zod';

export const TagDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  displayName: z.string(),
  photoCount: z.number().int().nonnegative().optional(),
  collectionCount: z.number().int().nonnegative().optional(),
});
export type TagDTO = z.infer<typeof TagDTO>;
