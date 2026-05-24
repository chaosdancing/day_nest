import * as fs from 'node:fs/promises';
import type { AccessTokenResult } from './types.js';

type Fetcher = () => Promise<AccessTokenResult>;

export type AccessTokenCacheOptions = {
  /**
   * When the remaining TTL of the cached token drops below this many seconds,
   * the next `get()` triggers a refetch. Defaults to 300s (5 min) — typical
   * WeChat access_tokens have a 7200s (2h) lifetime, so this leaves a wide margin.
   */
  renewBeforeSeconds?: number;
  /**
   * If set, the cache persists the token to this path as JSON. Reduces the
   * number of WeChat `cgi-bin/token` calls across server restarts (single
   * process). NOT designed for inter-process coordination — concurrent
   * writers will overwrite each other. The directory must already exist.
   */
  cachePath?: string;
};

/**
 * Shared cache for the WeChat app-level access_token.
 *
 * Two-level cache:
 *   1. In-memory: per-process, fastest path.
 *   2. File-backed (optional): survives single-process restarts. NOT a
 *      cross-process coordination mechanism — for cluster mode, use a
 *      shared external store (Redis, etc.).
 *
 * Concurrent first-callers coalesce on a single in-flight fetch (the
 * `inflight` field), so a thundering herd produces one upstream HTTP call.
 */
export class AccessTokenCache {
  private cached?: AccessTokenResult;
  private inflight?: Promise<AccessTokenResult>;
  private diskLoadPromise?: Promise<void>;
  private readonly opts: Required<Pick<AccessTokenCacheOptions, 'renewBeforeSeconds'>> &
    AccessTokenCacheOptions;

  constructor(opts: AccessTokenCacheOptions = {}) {
    this.opts = {
      renewBeforeSeconds: opts.renewBeforeSeconds ?? 300,
      cachePath: opts.cachePath,
    };
  }

  async get(fetcher: Fetcher): Promise<AccessTokenResult> {
    // Coalesce concurrent first-callers on a single disk-load.
    if (this.opts.cachePath && !this.diskLoadPromise) {
      this.diskLoadPromise = this.loadFromDisk(this.opts.cachePath);
    }
    if (this.diskLoadPromise) {
      await this.diskLoadPromise;
    }

    if (this.cached && !this.needsRenew(this.cached)) {
      return this.cached;
    }

    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = (async () => {
      try {
        const fresh = await fetcher();
        this.cached = fresh;
        if (this.opts.cachePath) {
          try {
            await fs.writeFile(this.opts.cachePath, JSON.stringify(fresh), 'utf-8');
          } catch {
            // Disk write failure shouldn't fail the request. The next
            // process restart will refetch, which is harmless.
          }
        }
        return fresh;
      } finally {
        this.inflight = undefined;
      }
    })();

    return this.inflight;
  }

  private async loadFromDisk(cachePath: string): Promise<void> {
    try {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as AccessTokenResult;
      if (parsed.accessToken && typeof parsed.expiresAt === 'number') {
        this.cached = parsed;
      }
    } catch {
      // Missing or corrupt disk cache — fall through to fetcher.
    }
  }

  private needsRenew(token: AccessTokenResult): boolean {
    const remaining = token.expiresAt - Math.floor(Date.now() / 1000);
    return remaining <= this.opts.renewBeforeSeconds;
  }
}
