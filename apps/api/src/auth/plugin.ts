import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { verifyAccess } from './jwt.js';
import { AppError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; username: string };
  }
  interface FastifyInstance {
    requireUser: (req: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('requireUser', async function (req: FastifyRequest) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHENTICATED', 'missing access token');
    }
    const token = header.slice('Bearer '.length);
    let claims;
    try {
      claims = await verifyAccess(token, app.deps.config.jwt.secret);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'invalid or expired token');
    }
    const user = await app.deps.prisma.user.findUnique({
      where: { id: claims.sub },
    });
    if (!user) throw new AppError(401, 'USER_GONE', 'user no longer exists');
    req.user = { id: user.id, username: user.username };
  });
});
