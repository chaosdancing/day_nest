import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { verifyAccess } from './jwt.js';
import { AppError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; username: string; canUpload: boolean };
  }
  interface FastifyInstance {
    requireUser: (req: FastifyRequest) => Promise<void>;
    // Authenticates AND requires upload rights (posting photos). View-only
    // WeChat accounts (no invite redeemed) are rejected with 403.
    requireUploader: (req: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  async function authenticate(req: FastifyRequest) {
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
    req.user = { id: user.id, username: user.username, canUpload: user.canUpload };
  }

  app.decorate('requireUser', authenticate);

  app.decorate('requireUploader', async function (req: FastifyRequest) {
    await authenticate(req);
    if (!req.user.canUpload) {
      throw new AppError(
        403,
        'UPLOAD_NOT_ALLOWED',
        'this account needs an invite to post photos',
      );
    }
  });
});
