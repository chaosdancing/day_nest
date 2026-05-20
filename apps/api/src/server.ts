import Fastify, { type FastifyServerOptions, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { StorageProvider } from './storage/provider.js';
import type { PrismaClient } from '@prisma/client';

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
  if (deps) app.decorate('deps', deps);
  app.get('/healthz', async () => ({ status: 'ok' }));
  return app;
}
