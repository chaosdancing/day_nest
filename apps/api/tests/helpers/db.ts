import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const TEST_DB_FILE = 'test.db';

let _migrated = false;
let _prisma: PrismaClient | null = null;

function ensureMigrated() {
  if (_migrated) return;
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, TEST_DB_FILE),
    resolve(cwd, 'prisma', TEST_DB_FILE),
  ];
  for (const p of candidates) {
    if (existsSync(p)) unlinkSync(p);
    if (existsSync(`${p}-journal`)) unlinkSync(`${p}-journal`);
  }
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: `file:./${TEST_DB_FILE}` },
    stdio: 'pipe',
  });
  _migrated = true;
}

const TABLES = [
  'PhotoFavorite',
  'PhotoTag',
  'CollectionTag',
  'Photo',
  'Collection',
  'Invite',
  'Tag',
  'WechatSubscription',
  'User',
];

export async function resetTestDb(): Promise<void> {
  ensureMigrated();
  if (!_prisma) {
    _prisma = new PrismaClient({ log: ['warn', 'error'] });
  }
  await _prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  for (const t of TABLES) {
    await _prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);
  }
  await _prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
}

export async function shutdownTestDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
