import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export async function createInvite(
  prisma: PrismaClient,
  issuerId: string,
  ttlHours: number
) {
  const token = randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
  return prisma.invite.create({
    data: { token, issuedById: issuerId, expiresAt },
  });
}

export async function consumeInvite(prisma: PrismaClient, token: string) {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) throw new Error('INVALID_INVITE');
  if (invite.consumedAt) throw new Error('INVITE_ALREADY_USED');
  if (invite.expiresAt.getTime() < Date.now()) throw new Error('INVITE_EXPIRED');
  await prisma.invite.update({
    where: { id: invite.id },
    data: { consumedAt: new Date() },
  });
  return invite;
}
