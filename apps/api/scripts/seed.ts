import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth/password.js';
import { createInvite } from '../src/services/invites.js';

const prisma = new PrismaClient();
const username = process.env.SEED_USERNAME ?? 'admin';
const displayName = process.env.SEED_DISPLAY_NAME ?? 'Admin';
const password = process.env.SEED_PASSWORD ?? randomBytes(8).toString('base64url');
const inviteTtlHours = Number(process.env.INVITE_TOKEN_TTL_HOURS ?? 72);

async function main() {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`[seed] user "${username}" already exists (id=${existing.id})`);
    return;
  }
  const user = await prisma.user.create({
    data: {
      username,
      displayName,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`[seed] created user "${username}"`);
  console.log(`[seed]   id:       ${user.id}`);
  console.log(`[seed]   password: ${password}`);
  const invite = await createInvite(prisma, user.id, inviteTtlHours);
  console.log(`[seed] invite token (give to family members):`);
  console.log(`[seed]   token:    ${invite.token}`);
  console.log(`[seed]   expires:  ${invite.expiresAt.toISOString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
