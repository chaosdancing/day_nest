import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('loads required env vars', () => {
    const cfg = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      QINIU_ACCESS_KEY: 'k',
      QINIU_SECRET_KEY: 's',
      QINIU_BUCKET: 'bucket',
      QINIU_DOMAIN: 'https://cdn.example.com',
    });
    expect(cfg.jwt.secret).toHaveLength(32);
    expect(cfg.qiniu.bucket).toBe('bucket');
  });

  it('rejects short JWT secret', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'file:./test.db',
        JWT_SECRET: 'short',
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        QINIU_ACCESS_KEY: 'k',
        QINIU_SECRET_KEY: 's',
        QINIU_BUCKET: 'b',
        QINIU_DOMAIN: 'https://x.example.com',
      })
    ).toThrow(/JWT_SECRET/);
  });
});
