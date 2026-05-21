import { getPrisma } from '../src/db.js';
import { createCollection } from '../src/services/collections.js';

async function main() {
  const p = getPrisma();
  const u = await p.user.findFirst();
  if (!u) {
    console.error('no user');
    process.exit(1);
  }
  await createCollection(p, u.id, {
    title: '小猫趣事',
    description: null,
    occurredOn: '2026-05-21',
    occurredUntil: null,
    location: null,
    tags: ['搞笑', '日常'],
    photos: [
      {
        fileKey: 'demo1.jpg',
        width: 800,
        height: 600,
        caption: null,
        takenAt: null,
        tags: ['搞笑'],
      },
    ],
  });
  await createCollection(p, u.id, {
    title: '春日散步',
    description: null,
    occurredOn: '2026-04-12',
    occurredUntil: null,
    location: '公园',
    tags: ['日常'],
    photos: [
      {
        fileKey: 'demo2.jpg',
        width: 800,
        height: 600,
        caption: null,
        takenAt: null,
        tags: [],
      },
    ],
  });
  console.log('seeded sample collections');
  await p.$disconnect();
}

void main();
