import type { FastifyInstance } from 'fastify';
import { createInvite } from '../services/invites.js';

export async function registerInviteRoutes(app: FastifyInstance) {
  app.post(
    // Only upload-capable family members can mint invites — viewers shouldn't
    // be able to widen access. Mirrors the client gating on the 我的 page.
    '/api/invites',
    { onRequest: [app.requireUploader] },
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
