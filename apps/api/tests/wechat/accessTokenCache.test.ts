import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AccessTokenCache } from '../../src/wechat/accessTokenCache.js';

describe('AccessTokenCache (in-memory only)', () => {
  it('returns the value from the fetcher on first call', async () => {
    const cache = new AccessTokenCache();
    const fetcher = async () => ({
      accessToken: 'tok-1',
      expiresAt: Math.floor(Date.now() / 1000) + 1000,
    });
    const r = await cache.get(fetcher);
    expect(r.accessToken).toBe('tok-1');
  });

  it('caches across calls — fetcher invoked only once', async () => {
    const cache = new AccessTokenCache();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return {
        accessToken: 'tok-1',
        expiresAt: Math.floor(Date.now() / 1000) + 1000,
      };
    };
    await cache.get(fetcher);
    await cache.get(fetcher);
    await cache.get(fetcher);
    expect(calls).toBe(1);
  });

  it('refetches when cached token is within the renewal window', async () => {
    // Token expires in 60s — we want to refresh when <= 120s remain
    const cache = new AccessTokenCache({ renewBeforeSeconds: 120 });
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return {
        accessToken: `tok-${calls}`,
        expiresAt: Math.floor(Date.now() / 1000) + 60, // 60s left, < 120s renew window
      };
    };
    const r1 = await cache.get(fetcher);
    const r2 = await cache.get(fetcher);
    expect(calls).toBe(2);
    expect(r1.accessToken).toBe('tok-1');
    expect(r2.accessToken).toBe('tok-2');
  });

  it('concurrent first calls coalesce into one fetcher invocation', async () => {
    const cache = new AccessTokenCache();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
      return {
        accessToken: 'tok-shared',
        expiresAt: Math.floor(Date.now() / 1000) + 1000,
      };
    };
    const results = await Promise.all([cache.get(fetcher), cache.get(fetcher), cache.get(fetcher)]);
    expect(calls).toBe(1);
    expect(results.every((r) => r.accessToken === 'tok-shared')).toBe(true);
  });
});

describe('AccessTokenCache (file-backed)', () => {
  let tmpDir: string;
  let cachePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wx-cache-test-'));
    cachePath = path.join(tmpDir, 'token.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists token to disk after fetch', async () => {
    const cache = new AccessTokenCache({ cachePath });
    await cache.get(async () => ({
      accessToken: 'persisted',
      expiresAt: Math.floor(Date.now() / 1000) + 1000,
    }));
    const raw = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.accessToken).toBe('persisted');
  });

  it('loads token from disk on first call (skips fetcher)', async () => {
    const future = Math.floor(Date.now() / 1000) + 1000;
    await fs.writeFile(
      cachePath,
      JSON.stringify({ accessToken: 'from-disk', expiresAt: future }),
    );
    const cache = new AccessTokenCache({ cachePath });
    let calls = 0;
    const r = await cache.get(async () => {
      calls++;
      return { accessToken: 'from-fetcher', expiresAt: future };
    });
    expect(calls).toBe(0);
    expect(r.accessToken).toBe('from-disk');
  });

  it('ignores disk cache when persisted token is expired', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    await fs.writeFile(
      cachePath,
      JSON.stringify({ accessToken: 'old', expiresAt: past }),
    );
    const cache = new AccessTokenCache({ cachePath });
    const r = await cache.get(async () => ({
      accessToken: 'fresh',
      expiresAt: Math.floor(Date.now() / 1000) + 1000,
    }));
    expect(r.accessToken).toBe('fresh');
  });
});
