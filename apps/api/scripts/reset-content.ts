import { getPrisma } from '../src/db.js';

/**
 * Wipe all content (collections / photos / tags and their join rows /
 * favorites) while KEEPING every login account (User), their invites and
 * WeChat bindings. Use this for a clean restart after switching to a new
 * Qiniu bucket, where every existing photo's fileKey points at the old
 * bucket and no longer resolves.
 *
 * Safety: dry-run by default. It only deletes when CONFIRM=wipe is set.
 *
 *   # 1) see what would be removed
 *   pnpm exec tsx --env-file=.env scripts/reset-content.ts
 *   # 2) actually wipe
 *   CONFIRM=wipe pnpm exec tsx --env-file=.env scripts/reset-content.ts
 */
async function main() {
  const p = getPrisma();
  const confirm = process.env.CONFIRM === 'wipe';

  const counts = {
    users: await p.user.count(),
    collections: await p.collection.count(),
    photos: await p.photo.count(),
    tags: await p.tag.count(),
    photoTags: await p.photoTag.count(),
    collectionTags: await p.collectionTag.count(),
    favorites: await p.photoFavorite.count(),
  };
  console.log('[reset] current counts:', counts);
  console.log('[reset] users will be KEPT:', counts.users);

  if (!confirm) {
    console.log(
      '\n[reset] DRY RUN — nothing deleted. Re-run with CONFIRM=wipe to execute.'
    );
    await p.$disconnect();
    return;
  }

  await p.$transaction([
    p.photoFavorite.deleteMany({}),
    p.photoTag.deleteMany({}),
    p.collectionTag.deleteMany({}),
    // Break the Collection -> coverPhoto FK before deleting photos.
    p.collection.updateMany({ data: { coverPhotoId: null } }),
    p.photo.deleteMany({}),
    p.collection.deleteMany({}),
    p.tag.deleteMany({}),
  ]);

  const after = {
    users: await p.user.count(),
    collections: await p.collection.count(),
    photos: await p.photo.count(),
    tags: await p.tag.count(),
  };
  console.log('[reset] done. remaining:', after);
  const remaining = await p.user.findMany({ select: { username: true } });
  console.log('[reset] accounts kept:', remaining.map((u) => u.username));
  await p.$disconnect();
}

void main();
