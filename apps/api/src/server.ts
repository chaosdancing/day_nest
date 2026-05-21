import Fastify, { type FastifyServerOptions, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { AppConfig } from './config.js';
import type { StorageProvider } from './storage/provider.js';
import type { PrismaClient } from '@prisma/client';
import { authPlugin } from './auth/plugin.js';
import { AppError } from './lib/errors.js';
import { registerInviteRoutes } from './routes/invites.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerCollectionRoutes } from './routes/collections.js';
import { registerPhotoRoutes } from './routes/photos.js';
import { registerTagRoutes } from './routes/tags.js';
import { registerFavoritesRoutes } from './routes/favorites.js';

export type AppDeps = {
  config: AppConfig;
  storage: StorageProvider;
  prisma: PrismaClient;
};

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

export async function buildServer(
  opts: FastifyServerOptions = {},
  deps?: AppDeps
): Promise<FastifyInstance> {
  const app = Fastify(opts);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ code: err.code, message: err.message });
    }
    const anyErr = err as { validation?: unknown; statusCode?: number };
    if (anyErr.validation) {
      return reply
        .status(400)
        .send({ code: 'VALIDATION_ERROR', message: err.message });
    }
    if (anyErr.statusCode && anyErr.statusCode < 500) {
      return reply
        .status(anyErr.statusCode)
        .send({ code: 'REQUEST_ERROR', message: err.message });
    }
    app.log.error(err);
    return reply.status(500).send({ code: 'INTERNAL', message: 'internal error' });
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  if (deps) {
    app.decorate('deps', deps);
    await app.register(cors, {
      origin:
        deps.config.corsOrigin === '*'
          ? true
          : deps.config.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    });
    await app.register(authPlugin);
    await registerAuthRoutes(app);
    await registerInviteRoutes(app);
    await registerUploadRoutes(app);
    await registerCollectionRoutes(app);
    await registerPhotoRoutes(app);
    await registerTagRoutes(app);
    await registerFavoritesRoutes(app);
  }

  return app;
}
