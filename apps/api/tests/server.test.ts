import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';

describe('server', () => {
  it('responds to /healthz', async () => {
    const { app, cleanup } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await cleanup();
  });
});
