import type { FastifyInstance } from 'fastify';
import { createInvite } from '../services/invites.js';

export async function registerInviteRoutes(app: FastifyInstance) {
  app.post(
    '/api/invites',
    { onRequest: [app.requireUser] },
    async (req) => {
      const invite = await createInvite(
        app.deps.prisma,
        req.user.id,
        app.deps.config.invite.ttlHours
      );
      return {
        token: invite.token,
        expiresAt: invite.expiresAt.toISOString(),
      };
    }
  );
}
