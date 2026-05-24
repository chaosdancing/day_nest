import { buildServer } from '../../src/server.js';
import { FakeStorage } from './storage.fake.js';
import { FakeWechatClient } from './wechat.fake.js';
import { resetTestDb } from './db.js';
import { getPrisma } from '../../src/db.js';
import { loadConfig } from '../../src/config.js';
import type { WechatClient } from '../../src/wechat/client.js';

export type BuildAppOverrides = {
  wechat?: WechatClient;
};

export async function buildApp(overrides: BuildAppOverrides = {}) {
  await resetTestDb();
  const config = loadConfig();
  const storage = new FakeStorage();
  const prisma = getPrisma();
  const wechat = overrides.wechat ?? new FakeWechatClient();
  const app = await buildServer(
    { logger: false },
    { config, storage, prisma, wechat },
  );
  return {
    app,
    storage,
    prisma,
    config,
    wechat,
    cleanup: async () => {
      await app.close();
    },
  };
}
