import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { AppError } from '../lib/errors.js';

const Body = z.object({
  ext: z.string().regex(/^[a-z0-9]{1,5}$/i).default('jpg').transform((v) => v.toLowerCase()),
  count: z.number().int().min(1).max(50).default(1),
  collectionDraftId: z.string().min(1).max(64).optional(),
});

export async function registerUploadRoutes(app: FastifyInstance) {
  app.post(
    '/api/uploads/token',
    { onRequest: [app.requireUploader] },
    async (req) => {
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'invalid body');
      }
      const { ext, count, collectionDraftId } = parsed.data;
      const folder =
        collectionDraftId ?? `draft-${req.user.id}-${Date.now()}`;
      const tokens = await Promise.all(
        Array.from({ length: count }, async () => {
          const photoId = randomUUID();
          const key = `photos/${folder}/${photoId}.${ext}`;
          return app.deps.storage.createUploadToken(key);
        })
      );
      return { tokens };
    }
  );
}
