import { buildServer } from '../../src/server.js';

export async function buildApp() {
  const app = await buildServer({ logger: false });
  return { app, cleanup: async () => { await app.close(); } };
}
