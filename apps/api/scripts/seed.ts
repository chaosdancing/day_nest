import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth/password.js';
import { createInvite } from '../src/services/invites.js';

const prisma = new PrismaClient();
const username = process.env.SEED_USERNAME ?? 'admin';
const displayName = process.env.SEED_DISPLAY_NAME ?? username.toUpperCase();
const password =
  process.env.SEED_PASSWORD ?? randomBytes(8).toString('base64url');
const inviteTtlHours = Number(process.env.INVITE_TOKEN_TTL_HOURS ?? 72);
const skipInvite = process.env.SEED_SKIP_INVITE === '1';

/**
 * Idempotent seed. Safe to re-run any time — designed to be the canonical
 * recovery path:
 *
 *   - If the user doesn't exist → create them with the given password.
 *   - If the user exists and SEED_PASSWORD was provided → reset their
 *     password (so we never get locked out after a wipe).
 *   - Optionally mint a fresh invite token (SEED_SKIP_INVITE=1 to opt out
 *     during routine recoveries).
 *
 * Examples:
 *   SEED_USERNAME=mom SEED_PASSWORD=daynest123 pnpm seed
 *   SEED_USERNAME=mom SEED_PASSWORD=newpw SEED_SKIP_INVITE=1 pnpm seed
 */
async function main() {
  const existing = await prisma.user.findUnique({ where: { username } });
  const userPasswordProvided = !!process.env.SEED_PASSWORD;

  let user;
  if (existing) {
    if (userPasswordProvided) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(password) },
      });
      console.log(`[seed] reset password for "${username}" (id=${user.id})`);
      console.log(`[seed]   password: ${password}`);
    } else {
      console.log(
        `[seed] user "${username}" already exists (id=${existing.id}); no password provided, skipping password change`
      );
      user = existing;
    }
  } else {
    user = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: await hashPassword(password),
      },
    });
    console.log(`[seed] created user "${username}"`);
    console.log(`[seed]   id:       ${user.id}`);
    console.log(`[seed]   password: ${password}`);
  }

  if (!skipInvite) {
    const invite = await createInvite(prisma, user.id, inviteTtlHours);
    console.log(`[seed] invite token (give to family members):`);
    console.log(`[seed]   token:    ${invite.token}`);
    console.log(`[seed]   expires:  ${invite.expiresAt.toISOString()}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
