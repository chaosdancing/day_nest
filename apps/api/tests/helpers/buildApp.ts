import { buildServer } from '../../src/server.js';
import { FakeStorage } from './storage.fake.js';
import { resetTestDb } from './db.js';
import { getPrisma } from '../../src/db.js';
import { loadConfig } from '../../src/config.js';

export async function buildApp() {
  await resetTestDb();
  const config = loadConfig();
  const storage = new FakeStorage();
  const prisma = getPrisma();
  const app = await buildServer({ logger: false }, { config, storage, prisma });
  return {
    app,
    storage,
    prisma,
    config,
    cleanup: async () => {
      await app.close();
    },
  };
}
