import { getPrisma } from '../src/db.js';

async function main() {
  const p = getPrisma();
  const users = await p.user.findMany({
    select: { username: true, displayName: true, id: true },
  });
  console.log(JSON.stringify(users, null, 2));
  const collections = await p.collection.count();
  const tags = await p.tag.count();
  console.log({ collections, tags });
  await p.$disconnect();
}

void main();
