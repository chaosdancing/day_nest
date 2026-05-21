import { getPrisma } from '../src/db.js';

/**
 * One-shot cleanup for dev.db: removes everything EXCEPT a configured
 * "keep" user (defaults to "mom") and their data. Used after the
 * test-isolation bug accidentally leaked test users into dev.db.
 *
 * Usage: KEEP_USERNAME=mom pnpm exec tsx --env-file=.env scripts/cleanup-orphans.ts
 */
async function main() {
  const p = getPrisma();
  const keep = process.env.KEEP_USERNAME ?? 'mom';
  const keepUser = await p.user.findUnique({ where: { username: keep } });
  if (!keepUser) {
    console.error(`[cleanup] keep user "${keep}" not found, refusing`);
    process.exit(1);
  }
  const before = await p.user.findMany({
    select: { id: true, username: true },
  });
  const others = before.filter((u) => u.id !== keepUser.id);
  if (others.length === 0) {
    console.log('[cleanup] nothing to drop, dev.db is clean');
    await p.$disconnect();
    return;
  }
  console.log(
    `[cleanup] removing ${others.length} user(s):`,
    others.map((u) => u.username).join(', ')
  );
  // Drop join + child rows first to avoid FK violations from related
  // tables (Tag.createdById, etc.) that aren't on a cascade.
  await p.photoFavorite.deleteMany({});
  await p.photoTag.deleteMany({});
  await p.collectionTag.deleteMany({});
  await p.photo.deleteMany({});
  await p.collection.deleteMany({});
  await p.tag.deleteMany({ where: { NOT: { createdById: keepUser.id } } });
  await p.invite.deleteMany({});
  for (const u of others) {
    await p.user.delete({ where: { id: u.id } });
  }
  const remaining = await p.user.findMany({
    select: { username: true },
  });
  console.log('[cleanup] users remaining:', remaining.map((u) => u.username));
  await p.$disconnect();
}

void main();
