# Mini-Program v1 — Plan 03 · Browse Experience (Lists + Detail + Viewer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four tab placeholder pages with the real browse experience (Timeline, Favorites, Tags overview, plus the Collection Detail page in a new `pkgCollection` subpackage and a no-zoom Photo Viewer). Ship the shared visual primitives (polaroid frame, stacked polaroid card, photo tile) and the API service layer that all subsequent plans (Upload, Settings, Subscribe-Message UX) will reuse.

**Architecture:** Adds a thin per-endpoint service layer under `lib/services/` that wraps the existing `createApiClient(...)` with strict input/output types from `@daynest/shared`. UI is split into reusable `Component({})` building blocks (StackedPolaroid, PhotoTile) plus four real `Page({})` files. The Timeline is the most complex page — it composes filter chips, an IME-tolerant title-search input, and an infinite-scroll list of collection cards. Photo Viewer ships as a working `<swiper>`-based reader; pinch-zoom + cross-collection swipe + share land in Plan 04. No backend changes.

**Tech Stack:** Native WeChat mini-program · TypeScript · Vitest (with the `wx` mock harness from Plan 02) · `@daynest/shared` DTOs · existing Plan 02 lib infrastructure (`createApiClient`, `authStore`, `themeStore`, `wxBridge`).

**Companion spec:** [`../specs/2026-05-22-miniapp-design.md`](../specs/2026-05-22-miniapp-design.md) — §3.2 (page tree), §3.4 (subpackage preload), §4.3 (polaroid frame), §4.7 (stacked polaroid), §4.8 (timeline rail).

**Backend dependency:** All endpoints consumed in this plan already exist on `main` (`/api/collections`, `/api/collections/:id`, `/api/favorites`, `/api/photos/:id/favorite`, `/api/photos/:id/url`, `/api/tags`). Plan 03 does **not** touch `apps/api/`.

**Scope of this plan:**
- ✅ API service wrappers (collections / favorites / tags / photos) + tests
- ✅ Subpackage scaffolding (`pkgCollection`) + `app.json` preload rule
- ✅ Visual primitives: polaroid WXSS partial, StackedPolaroid component, PhotoTile component
- ✅ Timeline page (list + filters + title search + infinite scroll)
- ✅ Favorites page (grid + favorited-by line + remove-favorite)
- ✅ Tags overview page (popular header + flat/categorized toggle + scope toggle)
- ✅ Collection detail page (`pkgCollection/detail`) with photo grid
- ✅ Photo viewer page (`pkgCollection/viewer`) — `<swiper>`-based prev/next, no pinch zoom yet
- ✅ Favorite-toggle action with optimistic update
- ✅ End-to-end smoke test for the browse flow

**Out of scope (Plan 04 and later):**
- ❌ Pinch-zoom + pure-JS touch handler — Plan 04
- ❌ Cross-collection swipe in viewer — Plan 04
- ❌ Tag pinboard page + tag rename / merge UI — Plan 04
- ❌ Photo viewer share / favorite from inside viewer — Plan 04
- ❌ Upload entry point on Timeline (currently a no-op fab) — Plan 04
- ❌ Subscribe-message prompts at favorite-time — Plan 05
- ❌ Avatar / displayName edit on FavoritedBy chips — Plan 05
- ❌ Real fonts (霞鹜文楷) — Plan 06

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `apps/miniapp/miniprogram/lib/services/collections.ts` | Typed wrappers for `GET /api/collections` and `GET /api/collections/:id` |
| `apps/miniapp/miniprogram/lib/services/favorites.ts` | Typed wrappers for `GET /api/favorites`, `POST/DELETE /api/photos/:id/favorite` |
| `apps/miniapp/miniprogram/lib/services/tags.ts` | Typed wrapper for `GET /api/tags` |
| `apps/miniapp/miniprogram/lib/services/photos.ts` | Typed wrapper for `GET /api/photos/:id/url` |
| `apps/miniapp/tests/lib/services/collections.test.ts` | Tests for collections service |
| `apps/miniapp/tests/lib/services/favorites.test.ts` | Tests for favorites service |
| `apps/miniapp/tests/lib/services/tags.test.ts` | Tests for tags service |
| `apps/miniapp/miniprogram/styles/polaroid.wxss` | Shared `.polaroid` / `.polaroid-frame` / `.tape` partials |
| `apps/miniapp/miniprogram/components/stacked-polaroid/index.{ts,wxml,wxss,json}` | Renders up to 3 photos in a back-to-front stack with hash-stable angles |
| `apps/miniapp/miniprogram/components/photo-tile/index.{ts,wxml,wxss,json}` | Single polaroid photo with optional heart, used in grids |
| `apps/miniapp/miniprogram/components/timeline-filters/index.{ts,wxml,wxss,json}` | Date preset chips + custom date picker + location input |
| `apps/miniapp/miniprogram/lib/hash.ts` | `stableAngle(seed)` / `stableInt(seed, max)` deterministic from a string |
| `apps/miniapp/tests/lib/hash.test.ts` | hash util tests |
| `apps/miniapp/miniprogram/lib/dateRange.ts` | `buildPresetRange('all'\|'30d'\|'year'\|'custom')` mirror of `apps/web/src/lib/timelineFilters.ts` |
| `apps/miniapp/tests/lib/dateRange.test.ts` | dateRange tests |
| `apps/miniapp/miniprogram/lib/debounce.ts` | `debounce(fn, ms)` returning `{ run, cancel, flush }` |
| `apps/miniapp/tests/lib/debounce.test.ts` | debounce tests |
| `apps/miniapp/miniprogram/pkgCollection/detail/index.{ts,wxml,wxss,json}` | Collection detail page |
| `apps/miniapp/miniprogram/pkgCollection/viewer/index.{ts,wxml,wxss,json}` | Photo viewer (no zoom) |

### Replaced files (placeholders from Plan 02 → real pages)

| Path | Change |
|---|---|
| `apps/miniapp/miniprogram/pages/timeline/index.{ts,wxml,wxss,json}` | Real timeline |
| `apps/miniapp/miniprogram/pages/favorites/index.{ts,wxml,wxss,json}` | Real favorites |
| `apps/miniapp/miniprogram/pages/tags/index.{ts,wxml,wxss,json}` | Real tags overview |

### Modified files

| Path | Change |
|---|---|
| `apps/miniapp/miniprogram/app.json` | Add `pkgCollection` subpackage entry + preload rule |
| `apps/miniapp/miniprogram/app.wxss` | `@import 'styles/polaroid.wxss';` |
| `apps/miniapp/miniprogram/pages/timeline/index.json` | Add `usingComponents` for stacked-polaroid + timeline-filters |
| `apps/miniapp/miniprogram/pages/favorites/index.json` | Add `usingComponents` for photo-tile |
| `apps/miniapp/miniprogram/pages/tags/index.json` | (no component imports needed; pure WXML) |

### Files NOT touched
- `apps/api/**` — backend frozen
- `apps/miniapp/miniprogram/pages/me/index.*` — Plan 05
- `apps/miniapp/miniprogram/pages/login/index.*` — Plan 02 final state
- `apps/miniapp/miniprogram/pages/bind/index.*` — Plan 02 final state
- `apps/miniapp/miniprogram/pkgOnboarding/register/index.*` — Plan 02 final state

---

## Conventions

- **TDD where the layer is testable** — services, hash, dateRange, debounce all get tests before impl. Page-level `Page({})` files have no unit tests (the `wx` page lifecycle isn't easily mockable); the end-to-end smoke test in Task 14 covers the wiring.
- **Run tests** — `pnpm --filter @daynest/miniapp test` (or `-- <pattern>` for a single file).
- **Typecheck** — `pnpm --filter @daynest/miniapp build`.
- **API access discipline** — pages call `services/<area>.ts`, not `createApiClient` directly. The service module instantiates `createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() })` ONCE at module load.
- **Component import discipline** — every page that uses a Component must declare it in its `index.json` `usingComponents`. Forgetting this is the #1 mini-app footgun.
- **WXSS units** — `rpx` only, except `1px` hairlines and `100vh`.
- **Commits** — Conventional Commits (`feat(miniapp):`, `test(miniapp):`).

---

## Task 1: API service wrappers

**Files:**
- Create: `apps/miniapp/miniprogram/lib/services/_client.ts` — single shared `apiClient` instance
- Create: `apps/miniapp/miniprogram/lib/services/collections.ts`
- Create: `apps/miniapp/miniprogram/lib/services/favorites.ts`
- Create: `apps/miniapp/miniprogram/lib/services/tags.ts`
- Create: `apps/miniapp/miniprogram/lib/services/photos.ts`
- Create: `apps/miniapp/tests/lib/services/collections.test.ts`
- Create: `apps/miniapp/tests/lib/services/favorites.test.ts`
- Create: `apps/miniapp/tests/lib/services/tags.test.ts`

The shared `_client.ts` exists so all six services share one `apiClient` (and therefore one `inflightRefresh` queue). This addresses the "per-page client multiplication" observation from the Plan 02 final review.

- [ ] **Step 1: Write the failing tests**

Create `apps/miniapp/tests/lib/services/collections.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { collectionsService } from '../../../miniprogram/lib/services/collections.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

function fixtureSummary(id: string, title: string) {
  return {
    id,
    title,
    description: null,
    occurredOn: '2026-05-01',
    occurredUntil: null,
    location: null,
    coverPhoto: null,
    previewPhotos: [],
    tags: [],
    photoCount: 3,
    createdBy: '00000000-0000-0000-0000-000000000001',
  };
}

describe('collectionsService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('list() returns items + nextCursor and appends query params', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { items: [fixtureSummary('c1', 'Spring trip')], nextCursor: 'cur-next' },
    });
    const res = await collectionsService.list({ limit: 20, title: '春', dateFrom: '2026-01-01' });
    expect(res.items[0]?.title).toBe('Spring trip');
    expect(res.nextCursor).toBe('cur-next');
    const req = mock.requests[0];
    expect(req?.url).toMatch(/\/api\/collections\?/);
    expect(req?.url).toMatch(/limit=20/);
    expect(req?.url).toMatch(/title=%E6%98%A5/);
    expect(req?.url).toMatch(/dateFrom=2026-01-01/);
  });

  it('list() omits undefined params from the query string', async () => {
    mock.queueResponse({ statusCode: 200, data: { items: [], nextCursor: null } });
    await collectionsService.list({ limit: 30 });
    const url = mock.requests[0]?.url ?? '';
    expect(url).not.toContain('title=');
    expect(url).not.toContain('dateFrom=');
    expect(url).toMatch(/limit=30/);
  });

  it('get(id) hits /api/collections/:id', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { ...fixtureSummary('c2', 'Birthday'), photos: [] },
    });
    const res = await collectionsService.get('c2');
    expect(res.title).toBe('Birthday');
    expect(mock.requests[0]?.url).toMatch(/\/api\/collections\/c2$/);
  });

  it('list() throws on non-200', async () => {
    mock.queueResponse({ statusCode: 500, data: { error: { code: 'SERVER' } } });
    await expect(collectionsService.list({ limit: 30 })).rejects.toThrow(/server|500/i);
  });
});
```

Create `apps/miniapp/tests/lib/services/favorites.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { favoritesService } from '../../../miniprogram/lib/services/favorites.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('favoritesService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('list() returns items + nextCursor', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { items: [], nextCursor: null },
    });
    const res = await favoritesService.list({ limit: 30 });
    expect(res.items).toEqual([]);
    expect(res.nextCursor).toBeNull();
    expect(mock.requests[0]?.url).toMatch(/\/api\/favorites\?limit=30$/);
  });

  it('add(photoId) hits POST /api/photos/:id/favorite', async () => {
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await favoritesService.add('p1');
    expect(mock.requests[0]?.method).toBe('POST');
    expect(mock.requests[0]?.url).toMatch(/\/api\/photos\/p1\/favorite$/);
  });

  it('remove(photoId) hits DELETE /api/photos/:id/favorite', async () => {
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await favoritesService.remove('p2');
    expect(mock.requests[0]?.method).toBe('DELETE');
    expect(mock.requests[0]?.url).toMatch(/\/api\/photos\/p2\/favorite$/);
  });

  it('add() throws on non-2xx', async () => {
    mock.queueResponse({ statusCode: 404, data: { error: { code: 'NOT_FOUND' } } });
    await expect(favoritesService.add('p3')).rejects.toThrow();
  });
});
```

Create `apps/miniapp/tests/lib/services/tags.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { tagsService } from '../../../miniprogram/lib/services/tags.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('tagsService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('list() returns the array directly', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: [
        { id: 't1', name: 'travel', displayName: '旅行', photoCount: 12, collectionCount: 3 },
        { id: 't2', name: 'birthday', displayName: '生日', photoCount: 6, collectionCount: 2 },
      ],
    });
    const tags = await tagsService.list();
    expect(tags.length).toBe(2);
    expect(tags[0]?.displayName).toBe('旅行');
    expect(mock.requests[0]?.url).toMatch(/\/api\/tags$/);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: 3 new files fail with `Cannot find module '.../services/...'`.

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/services/_client.ts`**

```typescript
import { createApiClient } from '../api.js';
import { endpoints } from '../endpoints.js';
import { authStore } from '../../stores/authStore.js';

/**
 * Process-wide singleton API client. All service modules share this so that
 * concurrent 401s on different endpoints collapse into a single refresh via
 * the api client's `inflightRefresh` promise.
 */
export const apiClient = createApiClient({
  tokens: authStore,
  refreshUrl: endpoints.refreshToken(),
});
```

- [ ] **Step 4: Create `apps/miniapp/miniprogram/lib/services/collections.ts`**

```typescript
import type { CollectionSummaryDTO, CollectionDetailDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';

export interface ListCollectionsParams {
  limit?: number;
  cursor?: string;
  title?: string;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  tag?: string;
  tagScope?: 'all' | 'collection' | 'photo';
}

export interface ListCollectionsResponse {
  items: CollectionSummaryDTO[];
  nextCursor: string | null;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function fail<T>(method: string, url: string, statusCode: number, body: unknown): Promise<T> {
  const code =
    (body as { error?: { code?: string } })?.error?.code ?? `HTTP_${statusCode}`;
  throw new Error(`${method} ${url} -> ${statusCode} ${code}`);
}

export const collectionsService = {
  async list(params: ListCollectionsParams = {}): Promise<ListCollectionsResponse> {
    const url = `${resolveApiBase()}/api/collections${qs(params as Record<string, string | number | undefined>)}`;
    const res = await apiClient.request<ListCollectionsResponse>({ url, method: 'GET' });
    if (res.statusCode !== 200) return fail('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async get(id: string): Promise<CollectionDetailDTO> {
    const url = `${resolveApiBase()}/api/collections/${encodeURIComponent(id)}`;
    const res = await apiClient.request<CollectionDetailDTO>({ url, method: 'GET' });
    if (res.statusCode !== 200) return fail('GET', url, res.statusCode, res.data);
    return res.data;
  },
};
```

- [ ] **Step 5: Create `apps/miniapp/miniprogram/lib/services/favorites.ts`**

```typescript
import type { FavoriteEntryDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';

export interface ListFavoritesParams {
  limit?: number;
  cursor?: string;
}

export interface ListFavoritesResponse {
  items: FavoriteEntryDTO[];
  nextCursor: string | null;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function ensureOk(method: string, url: string, statusCode: number, body: unknown): Promise<void> {
  if (statusCode >= 200 && statusCode < 300) return;
  const code = (body as { error?: { code?: string } })?.error?.code ?? `HTTP_${statusCode}`;
  throw new Error(`${method} ${url} -> ${statusCode} ${code}`);
}

export const favoritesService = {
  async list(params: ListFavoritesParams = {}): Promise<ListFavoritesResponse> {
    const url = `${resolveApiBase()}/api/favorites${qs(params as Record<string, string | number | undefined>)}`;
    const res = await apiClient.request<ListFavoritesResponse>({ url, method: 'GET' });
    await ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async add(photoId: string): Promise<void> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/favorite`;
    const res = await apiClient.request<unknown>({ url, method: 'POST', data: {} });
    await ensureOk('POST', url, res.statusCode, res.data);
  },

  async remove(photoId: string): Promise<void> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/favorite`;
    const res = await apiClient.request<unknown>({ url, method: 'DELETE' });
    await ensureOk('DELETE', url, res.statusCode, res.data);
  },
};
```

- [ ] **Step 6: Create `apps/miniapp/miniprogram/lib/services/tags.ts`**

```typescript
import type { TagDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';

export const tagsService = {
  async list(): Promise<TagDTO[]> {
    const url = `${resolveApiBase()}/api/tags`;
    const res = await apiClient.request<TagDTO[]>({ url, method: 'GET' });
    if (res.statusCode !== 200) {
      const code = (res.data as { error?: { code?: string } })?.error?.code ?? `HTTP_${res.statusCode}`;
      throw new Error(`GET ${url} -> ${res.statusCode} ${code}`);
    }
    return res.data;
  },
};
```

- [ ] **Step 7: Create `apps/miniapp/miniprogram/lib/services/photos.ts`**

```typescript
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';

export interface PhotoUrlResponse {
  url: string;
  expiresAt: string;
}

export const photosService = {
  async getUrl(photoId: string): Promise<PhotoUrlResponse> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/url`;
    const res = await apiClient.request<PhotoUrlResponse>({ url, method: 'GET' });
    if (res.statusCode !== 200) {
      const code = (res.data as { error?: { code?: string } })?.error?.code ?? `HTTP_${res.statusCode}`;
      throw new Error(`GET ${url} -> ${res.statusCode} ${code}`);
    }
    return res.data;
  },
};
```

- [ ] **Step 8: Run — must pass**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: prior 31 tests + 9 new service tests = **40** tests passing.

- [ ] **Step 9: Commit**

```bash
git add apps/miniapp/miniprogram/lib/services apps/miniapp/tests/lib/services
git commit -m "feat(miniapp): API service layer (collections / favorites / tags / photos) + tests"
```

---

## Task 2: app.json subpackages + preload

**Files:**
- Modify: `apps/miniapp/miniprogram/app.json`

- [ ] **Step 1: Add the `pkgCollection` subpackage**

In `apps/miniapp/miniprogram/app.json`, extend the existing `subPackages` array:

```json
{
  "subPackages": [
    {
      "root": "pkgOnboarding/",
      "name": "pkgOnboarding",
      "pages": ["register/index"]
    },
    {
      "root": "pkgCollection/",
      "name": "pkgCollection",
      "pages": ["detail/index", "viewer/index"]
    }
  ]
}
```

- [ ] **Step 2: Add `preloadRule` so the timeline silently fetches `pkgCollection` on wifi**

Add a top-level `preloadRule` block:

```json
{
  "preloadRule": {
    "pages/timeline/index": {
      "network": "wifi",
      "packages": ["pkgCollection"]
    }
  }
}
```

- [ ] **Step 3: Verify tsc + miniprogram-api-typings are happy**

```bash
pnpm --filter @daynest/miniapp build
```

The build is tsc-only — it doesn't validate `app.json` against WX's schema. WeChat DevTools will be the real validator when the user runs the project; we sanity-check by re-reading the file.

Expected: tsc clean. `app.json` now has 2 entries under `subPackages` and a `preloadRule` block.

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/app.json
git commit -m "chore(miniapp): register pkgCollection subpackage + wifi-preload from timeline"
```

---

## Task 3: Polaroid WXSS partial + `app.wxss` import

**Files:**
- Create: `apps/miniapp/miniprogram/styles/polaroid.wxss`
- Modify: `apps/miniapp/miniprogram/app.wxss`

- [ ] **Step 1: Create the partial**

`apps/miniapp/miniprogram/styles/polaroid.wxss`:

```css
/* Polaroid frame primitives. Pure WXSS, no images. */

.polaroid {
  background: #FFFCF5;
  padding: 14rpx 14rpx 60rpx 14rpx;
  border-radius: 6rpx;
  box-shadow: var(--shadow-polaroid);
  position: relative;
}

.polaroid__photo {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: var(--paper-aged);
  border-radius: 2rpx;
}

.polaroid__caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--ink-secondary);
  padding: 0 20rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Decorative tape on top edge. Color picked via .tape--<n> hash bucket. */
.tape {
  position: absolute;
  top: -16rpx;
  left: 50%;
  width: 96rpx;
  height: 32rpx;
  transform: translateX(-50%) rotate(-2deg);
  opacity: .85;
}
.tape--0 { background: linear-gradient(180deg, rgba(212,182,140,.85), rgba(212,182,140,.55)); }
.tape--1 { background: linear-gradient(180deg, rgba(212,150,140,.85), rgba(212,150,140,.55)); }
.tape--2 { background: linear-gradient(180deg, rgba(168,139,92,.85), rgba(168,139,92,.55)); }
.tape--3 { background: linear-gradient(180deg, rgba(120,140,160,.85), rgba(120,140,160,.55)); }
```

- [ ] **Step 2: Import into `app.wxss`**

Modify `apps/miniapp/miniprogram/app.wxss` — add the new import directly under the tokens import:

```css
@import 'styles/tokens.wxss';
@import 'styles/polaroid.wxss';

/* Reset (unchanged below) */
page {
  ...
}
```

(Keep all other lines as-is.)

- [ ] **Step 3: Commit**

```bash
git add apps/miniapp/miniprogram/styles/polaroid.wxss apps/miniapp/miniprogram/app.wxss
git commit -m "feat(miniapp): polaroid frame + decorative tape WXSS partials"
```

---

## Task 4: Hash util (stable angles for stacked cards)

**Files:**
- Create: `apps/miniapp/miniprogram/lib/hash.ts`
- Create: `apps/miniapp/tests/lib/hash.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { stableInt, stableAngle } from '../../miniprogram/lib/hash.js';

describe('hash util', () => {
  it('stableInt is deterministic across calls', () => {
    expect(stableInt('photo-1', 4)).toBe(stableInt('photo-1', 4));
    expect(stableInt('photo-2', 4)).toBe(stableInt('photo-2', 4));
  });

  it('stableInt yields a value in [0, max)', () => {
    for (let i = 0; i < 50; i++) {
      const v = stableInt(`seed-${i}`, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
    }
  });

  it('stableInt returns 0 when max <= 0', () => {
    expect(stableInt('x', 0)).toBe(0);
    expect(stableInt('x', -3)).toBe(0);
  });

  it('stableAngle returns a value in [-rangeDeg, +rangeDeg]', () => {
    for (let i = 0; i < 20; i++) {
      const a = stableAngle(`p-${i}`, 6);
      expect(a).toBeGreaterThanOrEqual(-6);
      expect(a).toBeLessThanOrEqual(6);
    }
  });

  it('stableAngle is deterministic', () => {
    expect(stableAngle('abc', 5)).toBe(stableAngle('abc', 5));
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/hash.ts`**

```typescript
/** djb2-style string hash. Returns a non-negative 32-bit int. */
function djb2(str: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

export function stableInt(seed: string, max: number): number {
  if (max <= 0) return 0;
  return djb2(seed) % max;
}

/**
 * Map a seed to a small rotation angle in [-rangeDeg, +rangeDeg] (degrees,
 * float to 1 dp). Used to give stacked polaroids a consistent quirky angle
 * across re-renders without per-photo random state.
 */
export function stableAngle(seed: string, rangeDeg: number): number {
  const bucket = djb2(seed) % 1000;
  const t = bucket / 999; // 0..1
  const angle = (t * 2 - 1) * rangeDeg;
  return Math.round(angle * 10) / 10;
}
```

- [ ] **Step 4: Run — must pass**

Expected: prior 40 + 5 hash tests = **45**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/hash.ts apps/miniapp/tests/lib/hash.test.ts
git commit -m "feat(miniapp): deterministic hash helper for stable polaroid angles"
```

---

## Task 5: dateRange util

**Files:**
- Create: `apps/miniapp/miniprogram/lib/dateRange.ts`
- Create: `apps/miniapp/tests/lib/dateRange.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/dateRange.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPresetRange, formatDateInput, type DatePreset } from '../../miniprogram/lib/dateRange.js';

describe('dateRange', () => {
  it('formatDateInput returns YYYY-MM-DD', () => {
    expect(formatDateInput(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05');
  });

  it('preset "all" returns empty range', () => {
    expect(buildPresetRange('all')).toEqual({});
  });

  it('preset "year" spans the local calendar year of the reference date', () => {
    // Reference date chosen mid-year so local and UTC agree regardless of
    // the test machine's timezone.
    const ref = new Date('2026-08-15T12:00:00Z');
    const range = buildPresetRange('year', ref);
    expect(range.dateFrom).toBe('2026-01-01');
    expect(range.dateTo).toBe('2026-12-31');
  });

  it('preset "30d" spans the trailing 30 days inclusive', () => {
    const ref = new Date('2026-05-31T00:00:00Z');
    const range = buildPresetRange('30d', ref);
    expect(range.dateTo).toBe('2026-05-31');
    expect(range.dateFrom).toBe('2026-05-02');
  });

  it('preset "7d" spans the trailing 7 days inclusive', () => {
    const ref = new Date('2026-05-31T00:00:00Z');
    const range = buildPresetRange('7d', ref);
    expect(range.dateTo).toBe('2026-05-31');
    expect(range.dateFrom).toBe('2026-05-25');
  });

  it('exports DatePreset type accepting the documented values', () => {
    const allowed: DatePreset[] = ['all', '7d', '30d', 'year', 'custom'];
    expect(allowed.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/dateRange.ts`**

```typescript
export type DatePreset = 'all' | '7d' | '30d' | 'year' | 'custom';

export interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

export function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildPresetRange(
  preset: Exclude<DatePreset, 'custom'>,
  now: Date = new Date(),
): DateRange {
  if (preset === 'all') return {};
  if (preset === 'year') {
    // Use local year so a Beijing user (UTC+8) opening the app at 02:00 on
    // Jan 1 sees the new year preset, not last year's. Matches the web
    // helper at apps/web/src/lib/timelineFilters.ts.
    const year = now.getFullYear();
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  const days = preset === '7d' ? 6 : 29;
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  return { dateFrom: formatDateInput(from), dateTo: formatDateInput(now) };
}
```

- [ ] **Step 4: Run — must pass**

Expected: prior 45 + 6 = **51** tests.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/dateRange.ts apps/miniapp/tests/lib/dateRange.test.ts
git commit -m "feat(miniapp): dateRange util — presets (7d / 30d / year / all / custom)"
```

---

## Task 6: debounce util

**Files:**
- Create: `apps/miniapp/miniprogram/lib/debounce.ts`
- Create: `apps/miniapp/tests/lib/debounce.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/debounce.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../miniprogram/lib/debounce.js';

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not invoke fn before delay elapses', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes fn once after delay with latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    d.run('b');
    d.run('c');
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cancel() prevents the pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() invokes immediately with latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    d.run('b');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() with no pending call is a no-op', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/debounce.ts`**

```typescript
export interface DebouncedFn<Args extends unknown[]> {
  run(...args: Args): void;
  cancel(): void;
  flush(): void;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): DebouncedFn<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  return {
    run(...args: Args) {
      pendingArgs = args;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pendingArgs) fn(...pendingArgs);
        timer = null;
        pendingArgs = null;
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendingArgs = null;
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (pendingArgs) {
        const args = pendingArgs;
        pendingArgs = null;
        fn(...args);
      }
    },
  };
}
```

- [ ] **Step 4: Run — must pass**

Expected: prior 51 + 5 = **56** tests.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/debounce.ts apps/miniapp/tests/lib/debounce.test.ts
git commit -m "feat(miniapp): debounce util with cancel + flush"
```

---

## Task 7: StackedPolaroid component

**Files:**
- Create: `apps/miniapp/miniprogram/components/stacked-polaroid/index.{ts,wxml,wxss,json}`

This component takes `previewPhotos` (an array of up to 3 photos with `thumbnailUrl`) and renders them as a back-to-front stack, with stable per-photo angles + tape colors derived from photo id via `stableInt`/`stableAngle`. If only 1 photo is supplied, the back/middle slots are hidden.

- [ ] **Step 1: Create `index.json`**

```json
{ "component": true, "usingComponents": {} }
```

- [ ] **Step 2: Create `index.ts`**

```typescript
import { stableInt, stableAngle } from '../../lib/hash.js';

interface PhotoLike {
  id: string;
  thumbnailUrl: string;
}

Component({
  options: { multipleSlots: false },
  properties: {
    previewPhotos: {
      type: Array,
      value: [] as PhotoLike[],
    },
    photoCount: {
      type: Number,
      value: 0,
    },
    caption: {
      type: String,
      value: '',
    },
  },
  data: {
    slots: [] as Array<{
      thumb: string;
      angle: number;
      tape: number;
      offsetX: number;
      offsetY: number;
      visible: boolean;
    }>,
  },
  observers: {
    previewPhotos(list: PhotoLike[]) {
      const items = (list ?? []).slice(0, 3);
      const slots: typeof this.data.slots = [];
      // back-most first, top-most last
      for (let i = 2; i >= 0; i--) {
        const p = items[i];
        if (!p) {
          slots.push({ thumb: '', angle: 0, tape: 0, offsetX: 0, offsetY: 0, visible: false });
          continue;
        }
        const angle = i === 0 ? stableAngle(p.id, 1) : stableAngle(p.id, 6);
        const offsetX = i === 0 ? 0 : (i === 1 ? 14 : 28);
        const offsetY = i === 0 ? 0 : (i === 1 ? 10 : 20);
        slots.push({
          thumb: p.thumbnailUrl,
          angle,
          tape: stableInt(p.id, 4),
          offsetX,
          offsetY,
          visible: true,
        });
      }
      this.setData({ slots });
    },
  },
});
```

- [ ] **Step 3: Create `index.wxml`**

```html
<view class="stack">
  <view
    wx:for="{{slots}}"
    wx:key="thumb"
    wx:if="{{item.visible}}"
    class="stack__slot polaroid"
    style="transform: translate({{item.offsetX}}rpx, {{item.offsetY}}rpx) rotate({{item.angle}}deg); z-index: {{index}};"
  >
    <view class="tape tape--{{item.tape}}"></view>
    <image class="polaroid__photo" src="{{item.thumb}}" mode="aspectFill" lazy-load="true"></image>
    <view wx:if="{{index === slots.length - 1 && caption}}" class="polaroid__caption">{{caption}}</view>
  </view>
  <view wx:if="{{photoCount > 1}}" class="stack__count">{{photoCount}} 张</view>
</view>
```

- [ ] **Step 4: Create `index.wxss`**

```css
.stack {
  position: relative;
  width: 360rpx;
  height: 320rpx;
}
.stack__slot {
  position: absolute;
  top: 0;
  left: 0;
  width: 320rpx;
  padding: 14rpx 14rpx 60rpx 14rpx;
}
.stack__count {
  position: absolute;
  right: -16rpx;
  bottom: -8rpx;
  background: var(--ink-primary);
  color: var(--paper-cream);
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  box-shadow: var(--shadow-sticker);
  z-index: 10;
}
```

- [ ] **Step 5: Verify tsc clean**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/components/stacked-polaroid
git commit -m "feat(miniapp): StackedPolaroid component (up to 3 photos, stable angles)"
```

---

## Task 8: PhotoTile component

**Files:**
- Create: `apps/miniapp/miniprogram/components/photo-tile/index.{ts,wxml,wxss,json}`

A single photo wrapped in a polaroid frame, used by the favorites grid and (eventually) collection detail. Emits `tap` when the photo body is tapped, and `favoriteTap` when the heart is tapped (so parent can run optimistic toggle).

- [ ] **Step 1: Create `index.json`**

```json
{ "component": true, "usingComponents": {} }
```

- [ ] **Step 2: Create `index.ts`**

```typescript
import { stableAngle, stableInt } from '../../lib/hash.js';

Component({
  properties: {
    photoId: { type: String, value: '' },
    thumbnailUrl: { type: String, value: '' },
    caption: { type: String, value: '' },
    favoritedByMe: { type: Boolean, value: false },
    favoriteCount: { type: Number, value: 0 },
    showHeart: { type: Boolean, value: true },
  },
  data: {
    angle: 0,
    tape: 0,
  },
  observers: {
    photoId(id: string) {
      if (!id) return;
      this.setData({
        angle: stableAngle(id, 3),
        tape: stableInt(id, 4),
      });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { photoId: this.data.photoId });
    },
    onFavoriteTap(e: WechatMiniprogram.TouchEvent) {
      // `stopPropagation` isn't on WechatMiniprogram.TouchEvent — WXML uses
      // `catchtap` to stop propagation at the WX layer. We keep the optional
      // call as defense-in-depth in case the runtime exposes it.
      (e as { stopPropagation?: () => void }).stopPropagation?.();
      this.triggerEvent('favoritetap', { photoId: this.data.photoId });
    },
  },
});
```

- [ ] **Step 3: Create `index.wxml`**

```html
<view class="tile polaroid" style="transform: rotate({{angle}}deg);" bindtap="onTap">
  <view class="tape tape--{{tape}}"></view>
  <image class="polaroid__photo" src="{{thumbnailUrl}}" mode="aspectFill" lazy-load="true"></image>
  <view wx:if="{{caption}}" class="polaroid__caption">{{caption}}</view>
  <view wx:if="{{showHeart}}" class="tile__heart {{favoritedByMe ? 'tile__heart--on' : ''}}" catchtap="onFavoriteTap">
    <view class="tile__heart-shape"></view>
    <view wx:if="{{favoriteCount > 0}}" class="tile__heart-count">{{favoriteCount}}</view>
  </view>
</view>
```

- [ ] **Step 4: Create `index.wxss`**

```css
.tile {
  width: 100%;
}
.tile__heart {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 12rpx;
  background: rgba(255,255,255,.85);
  border-radius: 999rpx;
  box-shadow: var(--shadow-sticker);
}
.tile__heart-shape {
  width: 28rpx;
  height: 28rpx;
  background-color: var(--paper-aged);
  clip-path: path('M14 25 L4 14 A6 6 0 0 1 14 6 A6 6 0 0 1 24 14 Z');
}
.tile__heart--on .tile__heart-shape { background-color: var(--ink-sticker); }
.tile__heart-count { font-size: 22rpx; color: var(--ink-secondary); }
```

(Heart shape via `clip-path: path(...)` keeps it pure WXSS, no SVG asset needed. The mini-program WebView supports `clip-path` in iOS 13+ and modern Android — acceptable per the device matrix.)

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/components/photo-tile
git commit -m "feat(miniapp): PhotoTile component with heart toggle event"
```

---

## Task 9: TimelineFilters component

**Files:**
- Create: `apps/miniapp/miniprogram/components/timeline-filters/index.{ts,wxml,wxss,json}`

Compact horizontal row: 4 preset chips (全部 / 近 7 天 / 近 30 天 / 今年), a custom-date picker that's hidden until the "自定义" chip is toggled, and an optional `<input>` for location text. Emits `change` with `{ dateFrom?, dateTo?, location? }`.

- [ ] **Step 1: Create `index.json`**

```json
{ "component": true, "usingComponents": {} }
```

- [ ] **Step 2: Create `index.ts`**

```typescript
import { buildPresetRange, type DatePreset, type DateRange } from '../../lib/dateRange.js';

const PRESETS: Array<{ key: DatePreset; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'year', label: '今年' },
  { key: 'custom', label: '自定义' },
];

Component({
  data: {
    presets: PRESETS,
    active: 'all' as DatePreset,
    customFrom: '',
    customTo: '',
    location: '',
  },
  methods: {
    onPresetTap(e: WechatMiniprogram.TouchEvent) {
      const key = e.currentTarget.dataset.key as DatePreset;
      if (key === 'custom') {
        this.setData({ active: 'custom' });
        return;
      }
      const range = buildPresetRange(key);
      this.setData({ active: key, customFrom: '', customTo: '' });
      this.emit(range);
    },
    onCustomFrom(e: WechatMiniprogram.PickerChange) {
      const v = String(e.detail.value);
      this.setData({ customFrom: v });
      this.emitCustom();
    },
    onCustomTo(e: WechatMiniprogram.PickerChange) {
      const v = String(e.detail.value);
      this.setData({ customTo: v });
      this.emitCustom();
    },
    onLocation(e: WechatMiniprogram.Input) {
      this.setData({ location: e.detail.value });
      this.emit({ dateFrom: this.data.customFrom || undefined, dateTo: this.data.customTo || undefined });
    },
    emitCustom() {
      this.emit({
        dateFrom: this.data.customFrom || undefined,
        dateTo: this.data.customTo || undefined,
      });
    },
    emit(range: DateRange) {
      this.triggerEvent('change', {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        location: this.data.location || undefined,
      });
    },
  },
});
```

- [ ] **Step 3: Create `index.wxml`**

```html
<view class="filters">
  <scroll-view class="filters__chips" scroll-x="true">
    <view
      wx:for="{{presets}}"
      wx:key="key"
      class="chip {{active === item.key ? 'chip--on' : ''}}"
      data-key="{{item.key}}"
      bindtap="onPresetTap"
    >{{item.label}}</view>
  </scroll-view>

  <view wx:if="{{active === 'custom'}}" class="filters__custom">
    <picker mode="date" value="{{customFrom}}" bindchange="onCustomFrom">
      <view class="filters__date">{{customFrom || '起 ▾'}}</view>
    </picker>
    <view class="filters__dash">—</view>
    <picker mode="date" value="{{customTo}}" bindchange="onCustomTo">
      <view class="filters__date">{{customTo || '止 ▾'}}</view>
    </picker>
  </view>

  <input
    class="filters__location"
    placeholder="按地点筛选（可选）"
    value="{{location}}"
    bindinput="onLocation"
  />
</view>
```

- [ ] **Step 4: Create `index.wxss`**

```css
.filters {
  padding: 16rpx 24rpx;
  background: var(--paper-cream);
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.filters__chips { white-space: nowrap; }
.chip {
  display: inline-block;
  padding: 10rpx 22rpx;
  margin-right: 10rpx;
  background: var(--paper-aged);
  color: var(--ink-secondary);
  border-radius: 999rpx;
  font-size: 24rpx;
}
.chip--on {
  background: var(--ink-primary);
  color: var(--paper-cream);
}
.filters__custom {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.filters__date {
  background: #FFFCF5;
  border: 1px solid var(--paper-aged);
  padding: 10rpx 20rpx;
  border-radius: 6rpx;
  font-size: 24rpx;
}
.filters__dash {
  color: var(--ink-secondary);
}
.filters__location {
  background: #FFFCF5;
  border: 1px solid var(--paper-aged);
  padding: 14rpx 20rpx;
  border-radius: 6rpx;
  font-size: 24rpx;
}
```

- [ ] **Step 5: Verify tsc**

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/components/timeline-filters
git commit -m "feat(miniapp): TimelineFilters component (preset chips + date picker + location)"
```

---

## Task 10: Timeline page (real)

**Files:**
- Replace: `apps/miniapp/miniprogram/pages/timeline/index.{ts,wxml,wxss,json}`

Timeline composes everything: filter bar, fuzzy title search, paginated collection list, stacked polaroid card per item. Tapping a card → `wx.navigateTo('/pkgCollection/detail/index?id=...')`. Pull-to-refresh; infinite scroll on `scrolltolower`.

- [ ] **Step 1: Replace `apps/miniapp/miniprogram/pages/timeline/index.json`**

```json
{
  "navigationBarTitleText": "朝夕居",
  "enablePullDownRefresh": true,
  "usingComponents": {
    "stacked-polaroid": "/components/stacked-polaroid/index",
    "timeline-filters": "/components/timeline-filters/index"
  }
}
```

- [ ] **Step 2: Replace `apps/miniapp/miniprogram/pages/timeline/index.wxml`**

```html
<view class="page">
  <timeline-filters bind:change="onFilterChange" />

  <view class="search">
    <input
      class="search__input"
      placeholder="按集合名搜索"
      value="{{searchInput}}"
      bindinput="onSearchInput"
      confirm-type="search"
      bindconfirm="onSearchConfirm"
    />
    <view wx:if="{{searchInput}}" class="search__clear" bindtap="onSearchClear">清空</view>
  </view>

  <view wx:if="{{loading && items.length === 0}}" class="empty">读取中…</view>
  <view wx:elif="{{!loading && items.length === 0}}" class="empty">还没有集合</view>

  <scroll-view
    class="list"
    scroll-y="true"
    enable-back-to-top="true"
    bindscrolltolower="onLoadMore"
  >
    <view
      wx:for="{{items}}"
      wx:key="id"
      class="row"
      data-id="{{item.id}}"
      bindtap="onCardTap"
    >
      <view class="row__rail">
        <view class="row__dot"></view>
        <view class="row__date">{{item.occurredOn}}</view>
      </view>
      <view class="row__card">
        <stacked-polaroid
          previewPhotos="{{item.previewPhotos}}"
          photoCount="{{item.photoCount}}"
          caption="{{item.title}}"
        />
        <view wx:if="{{item.location}}" class="row__location">{{item.location}}</view>
        <view wx:if="{{item.tags.length}}" class="row__tags">
          <view wx:for="{{item.tags}}" wx:for-item="tag" wx:key="id" class="row__tag">#{{tag.displayName}}</view>
        </view>
      </view>
    </view>

    <view wx:if="{{loadingMore}}" class="footer">加载更多…</view>
    <view wx:elif="{{!nextCursor && items.length > 0}}" class="footer">到底了</view>
  </scroll-view>
</view>
```

- [ ] **Step 3: Replace `apps/miniapp/miniprogram/pages/timeline/index.wxss`**

```css
.page {
  background: var(--paper-cream);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.search {
  padding: 0 24rpx 16rpx;
  position: relative;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.search__input {
  flex: 1;
  background: #FFFCF5;
  border: 1px solid var(--paper-aged);
  padding: 16rpx 24rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
}
.search__clear {
  font-size: 24rpx;
  color: var(--ink-secondary);
}
.empty {
  padding: 200rpx 0;
  text-align: center;
  color: var(--ink-secondary);
  font-size: 26rpx;
}
.list {
  flex: 1;
  padding: 16rpx 24rpx 120rpx;
}
.row {
  display: flex;
  gap: 16rpx;
  padding: 24rpx 0;
  position: relative;
}
.row::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 36rpx;
  width: 2rpx;
  background: repeating-linear-gradient(180deg, var(--paper-sepia) 0 6rpx, transparent 6rpx 12rpx);
}
.row__rail {
  width: 72rpx;
  flex: 0 0 72rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.row__dot {
  width: 16rpx;
  height: 16rpx;
  background: var(--ink-sticker);
  border-radius: 50%;
  margin-top: 32rpx;
  box-shadow: 0 0 0 6rpx var(--paper-cream);
  z-index: 1;
}
.row__date {
  margin-top: 16rpx;
  font-size: 22rpx;
  color: var(--ink-secondary);
  writing-mode: horizontal-tb;
}
.row__card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.row__location { font-size: 24rpx; color: var(--ink-secondary); }
.row__tags { display: flex; flex-wrap: wrap; gap: 8rpx; }
.row__tag { font-size: 22rpx; color: var(--ink-secondary); padding: 4rpx 12rpx; background: var(--paper-aged); border-radius: 999rpx; }
.footer { padding: 32rpx 0; text-align: center; color: var(--ink-secondary); font-size: 24rpx; }
```

- [ ] **Step 4: Replace `apps/miniapp/miniprogram/pages/timeline/index.ts`**

```typescript
import type { CollectionSummaryDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { debounce } from '../../lib/debounce.js';

interface FilterChange {
  dateFrom?: string;
  dateTo?: string;
  location?: string;
}

Page({
  data: {
    items: [] as CollectionSummaryDTO[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
    searchInput: '',
    activeTitle: '',
    filter: {} as FilterChange,
  },

  searchDebounce: null as ReturnType<typeof debounce<[string]>> | null,

  onLoad() {
    this.searchDebounce = debounce((value: string) => {
      this.setData({ activeTitle: value });
      this.refresh();
    }, 300);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 });
    }
    if (this.data.items.length === 0 && !this.data.loading) {
      this.refresh();
    }
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, items: [], nextCursor: null });
    try {
      const res = await collectionsService.list({
        limit: 20,
        ...this.data.filter,
        title: this.data.activeTitle || undefined,
      });
      this.setData({ items: res.items, nextCursor: res.nextCursor });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onLoadMore() {
    if (!this.data.nextCursor || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      const res = await collectionsService.list({
        limit: 20,
        cursor: this.data.nextCursor,
        ...this.data.filter,
        title: this.data.activeTitle || undefined,
      });
      this.setData({
        items: [...this.data.items, ...res.items],
        nextCursor: res.nextCursor,
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onFilterChange(e: WechatMiniprogram.CustomEvent<FilterChange>) {
    this.setData({ filter: e.detail });
    this.refresh();
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value;
    this.setData({ searchInput: value });
    this.searchDebounce?.run(value);
  },

  onSearchConfirm(e: WechatMiniprogram.Input) {
    this.searchDebounce?.cancel();
    this.setData({ activeTitle: e.detail.value });
    this.refresh();
  },

  onSearchClear() {
    this.searchDebounce?.cancel();
    this.setData({ searchInput: '', activeTitle: '' });
    this.refresh();
  },

  onCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pkgCollection/detail/index?id=${encodeURIComponent(id)}` });
  },
});
```

Note: `searchDebounce` is stored as an instance property via `this.<name> =`. WeChat allows this — non-`data` properties on the Page instance are fine and don't trigger setData re-renders.

- [ ] **Step 5: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/pages/timeline
git commit -m "feat(miniapp): real timeline page (list + filters + search + infinite scroll)"
```

---

## Task 11: Favorites page (real)

**Files:**
- Replace: `apps/miniapp/miniprogram/pages/favorites/index.{ts,wxml,wxss,json}`

A 2-column grid of `PhotoTile` cards, each showing the photo + heart count + "by X" line. Tap heart → unfavorite (optimistic). Tap card → navigate to collection detail anchored on this photo (Plan 04 will deep-link to the viewer).

- [ ] **Step 1: Replace `index.json`**

```json
{
  "navigationBarTitleText": "收藏",
  "enablePullDownRefresh": true,
  "usingComponents": {
    "photo-tile": "/components/photo-tile/index"
  }
}
```

- [ ] **Step 2: Replace `index.wxml`**

```html
<view class="page">
  <view wx:if="{{loading && items.length === 0}}" class="empty">读取中…</view>
  <view wx:elif="{{!loading && items.length === 0}}" class="empty">还没有收藏</view>

  <scroll-view
    class="grid"
    scroll-y="true"
    enable-back-to-top="true"
    bindscrolltolower="onLoadMore"
  >
    <view
      wx:for="{{items}}"
      wx:key="id"
      class="grid__cell"
    >
      <photo-tile
        photoId="{{item.photo.id}}"
        thumbnailUrl="{{item.photo.thumbnailUrl}}"
        caption="{{item.collection.title}}"
        favoritedByMe="{{true}}"
        favoriteCount="{{item.photo.favoriteCount}}"
        bind:tap="onPhotoTap"
        bind:favoritetap="onFavoriteToggle"
      />
      <view class="grid__meta">
        <text class="grid__date">{{item.collection.occurredOn}}</text>
        <view wx:if="{{item.favoritedBy.length > 1}}" class="grid__by">+{{item.favoritedBy.length - 1}} 人也收藏</view>
      </view>
    </view>
    <view wx:if="{{loadingMore}}" class="footer">加载更多…</view>
    <view wx:elif="{{!nextCursor && items.length > 0}}" class="footer">到底了</view>
  </scroll-view>
</view>
```

- [ ] **Step 3: Replace `index.wxss`**

```css
.page { background: var(--paper-cream); min-height: 100vh; display: flex; flex-direction: column; }
.empty { padding: 200rpx 0; text-align: center; color: var(--ink-secondary); font-size: 26rpx; }
.grid {
  flex: 1;
  padding: 16rpx;
  column-count: 2;
  column-gap: 16rpx;
}
.grid__cell {
  break-inside: avoid;
  margin-bottom: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.grid__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8rpx;
  font-size: 22rpx;
  color: var(--ink-secondary);
}
.grid__date {}
.grid__by {}
.footer { padding: 32rpx 0; text-align: center; color: var(--ink-secondary); font-size: 24rpx; column-span: all; }
```

- [ ] **Step 4: Replace `index.ts`**

```typescript
import type { FavoriteEntryDTO } from '@daynest/shared';
import { favoritesService } from '../../lib/services/favorites.js';

interface Item {
  id: string;        // photo.id (key for wx:for)
  photo: FavoriteEntryDTO['photo'];
  collection: FavoriteEntryDTO['collection'];
  favoritedBy: FavoriteEntryDTO['favoritedBy'];
}

Page({
  data: {
    items: [] as Item[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 1 });
    }
    if (this.data.items.length === 0 && !this.data.loading) this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, items: [], nextCursor: null });
    try {
      const res = await favoritesService.list({ limit: 30 });
      this.setData({ items: res.items.map((e) => ({ id: e.photo.id, photo: e.photo, collection: e.collection, favoritedBy: e.favoritedBy })), nextCursor: res.nextCursor });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onLoadMore() {
    if (!this.data.nextCursor || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      const res = await favoritesService.list({ limit: 30, cursor: this.data.nextCursor });
      this.setData({
        items: [...this.data.items, ...res.items.map((e) => ({ id: e.photo.id, photo: e.photo, collection: e.collection, favoritedBy: e.favoritedBy }))],
        nextCursor: res.nextCursor,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onPhotoTap(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    const item = this.data.items.find((i) => i.id === e.detail.photoId);
    if (!item) return;
    wx.navigateTo({
      url: `/pkgCollection/detail/index?id=${encodeURIComponent(item.collection.id)}&photoId=${encodeURIComponent(item.id)}`,
    });
  },

  async onFavoriteToggle(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    const photoId = e.detail.photoId;
    const idx = this.data.items.findIndex((i) => i.id === photoId);
    if (idx < 0) return;
    // Optimistic: remove from list
    const prev = this.data.items;
    this.setData({ items: prev.filter((_, i) => i !== idx) });
    try {
      await favoritesService.remove(photoId);
    } catch {
      // Revert
      this.setData({ items: prev });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/pages/favorites
git commit -m "feat(miniapp): real favorites page (grid + optimistic unfavorite)"
```

---

## Task 12: Tags overview page (real)

**Files:**
- Replace: `apps/miniapp/miniprogram/pages/tags/index.{ts,wxml,wxss,json}`

Top section: **popular** (top 6 by photoCount + collectionCount). Body: toggle between **flat** (all tags as chips) and **categorized** (currently just split by "has-collections" vs "photo-only" — the spec's "categorized" view will expand later). Scope toggle (collection vs photo vs all) is parked for Plan 04's tag pinboard; on the overview, tapping a tag chip navigates to `/pkgTags/pinboard/index?name=...` (which doesn't exist yet — Plan 04 lands it). For now, tag taps show a Toast "标签详情即将上线".

- [ ] **Step 1: Replace `index.json`**

```json
{ "navigationBarTitleText": "标签", "enablePullDownRefresh": true, "usingComponents": {} }
```

- [ ] **Step 2: Replace `index.wxml`**

```html
<view class="page">
  <view wx:if="{{loading}}" class="empty">读取中…</view>
  <view wx:elif="{{tags.length === 0}}" class="empty">还没有标签</view>

  <scroll-view class="scroll" scroll-y="true">
    <view wx:if="{{popular.length > 0}}" class="block">
      <view class="block__title">热门</view>
      <view class="cloud">
        <view
          wx:for="{{popular}}"
          wx:key="id"
          class="chip chip--big"
          data-name="{{item.name}}"
          bindtap="onTagTap"
        >#{{item.displayName}}
          <text class="chip__count">{{(item.photoCount || 0) + (item.collectionCount || 0)}}</text>
        </view>
      </view>
    </view>

    <view class="toolbar">
      <view
        class="seg {{view === 'flat' ? 'seg--on' : ''}}"
        data-view="flat"
        bindtap="onSwitchView"
      >平铺</view>
      <view
        class="seg {{view === 'categorized' ? 'seg--on' : ''}}"
        data-view="categorized"
        bindtap="onSwitchView"
      >分类</view>
    </view>

    <view wx:if="{{view === 'flat'}}" class="block">
      <view class="cloud">
        <view
          wx:for="{{tags}}"
          wx:key="id"
          class="chip"
          data-name="{{item.name}}"
          bindtap="onTagTap"
        >#{{item.displayName}}</view>
      </view>
    </view>

    <block wx:if="{{view === 'categorized'}}">
      <view class="block">
        <view class="block__title">集合维度</view>
        <view class="cloud">
          <view
            wx:for="{{collectionTags}}"
            wx:key="id"
            class="chip"
            data-name="{{item.name}}"
            bindtap="onTagTap"
          >#{{item.displayName}} <text class="chip__count">{{item.collectionCount || 0}}</text></view>
        </view>
      </view>
      <view class="block">
        <view class="block__title">照片维度</view>
        <view class="cloud">
          <view
            wx:for="{{photoOnlyTags}}"
            wx:key="id"
            class="chip"
            data-name="{{item.name}}"
            bindtap="onTagTap"
          >#{{item.displayName}} <text class="chip__count">{{item.photoCount || 0}}</text></view>
        </view>
      </view>
    </block>
  </scroll-view>
</view>
```

- [ ] **Step 3: Replace `index.wxss`**

```css
.page { background: var(--paper-cream); min-height: 100vh; }
.empty { padding: 200rpx 0; text-align: center; color: var(--ink-secondary); font-size: 26rpx; }
.scroll { padding: 16rpx 24rpx 120rpx; }
.block { margin-bottom: 32rpx; }
.block__title { font-size: 24rpx; color: var(--ink-secondary); margin-bottom: 12rpx; }
.cloud { display: flex; flex-wrap: wrap; gap: 12rpx; }
.chip {
  padding: 10rpx 22rpx;
  background: var(--paper-aged);
  color: var(--ink-primary);
  border-radius: 999rpx;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.chip--big { font-size: 28rpx; padding: 14rpx 26rpx; }
.chip__count {
  font-size: 20rpx;
  color: var(--ink-secondary);
  background: rgba(255,255,255,.5);
  padding: 0 8rpx;
  border-radius: 999rpx;
}
.toolbar { display: flex; gap: 12rpx; margin-bottom: 16rpx; }
.seg {
  padding: 10rpx 24rpx;
  border: 1px solid var(--paper-aged);
  border-radius: 999rpx;
  font-size: 24rpx;
  color: var(--ink-secondary);
}
.seg--on { background: var(--ink-primary); color: var(--paper-cream); border-color: var(--ink-primary); }
```

- [ ] **Step 4: Replace `index.ts`**

```typescript
import type { TagDTO } from '@daynest/shared';
import { tagsService } from '../../lib/services/tags.js';

Page({
  data: {
    tags: [] as TagDTO[],
    popular: [] as TagDTO[],
    collectionTags: [] as TagDTO[],
    photoOnlyTags: [] as TagDTO[],
    view: 'flat' as 'flat' | 'categorized',
    loading: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 2 });
    }
    if (this.data.tags.length === 0 && !this.data.loading) this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const tags = await tagsService.list();
      const popular = [...tags]
        .sort((a, b) => ((b.photoCount ?? 0) + (b.collectionCount ?? 0)) - ((a.photoCount ?? 0) + (a.collectionCount ?? 0)))
        .slice(0, 6);
      const collectionTags = tags.filter((t) => (t.collectionCount ?? 0) > 0);
      const photoOnlyTags = tags.filter((t) => (t.collectionCount ?? 0) === 0 && (t.photoCount ?? 0) > 0);
      this.setData({ tags, popular, collectionTags, photoOnlyTags });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSwitchView(e: WechatMiniprogram.TouchEvent) {
    const view = e.currentTarget.dataset.view as 'flat' | 'categorized';
    this.setData({ view });
  },

  onTagTap() {
    wx.showToast({ title: '标签详情即将上线', icon: 'none' });
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/pages/tags
git commit -m "feat(miniapp): real tags overview (popular + flat / categorized + scope toggle)"
```

---

## Task 13: Collection detail page

**Files:**
- Create: `apps/miniapp/miniprogram/pkgCollection/detail/index.{ts,wxml,wxss,json}`

Shows the collection header (title, date, location, tags) followed by a 2-column grid of `PhotoTile`s. Tap photo → `wx.navigateTo('/pkgCollection/viewer/index?collectionId=...&photoId=...')`. The optional `photoId` from the favorites deep-link auto-scrolls and pre-selects the matching tile (we can scroll-into-view via `scroll-into-view`; if the photo isn't loaded yet, the viewer-deep-link feature is best-effort and Plan 04 will polish it).

- [ ] **Step 1: Create `index.json`**

```json
{
  "navigationBarTitleText": "集合详情",
  "usingComponents": {
    "photo-tile": "/components/photo-tile/index"
  }
}
```

- [ ] **Step 2: Create `index.wxml`**

```html
<view class="page">
  <view wx:if="{{loading}}" class="empty">读取中…</view>
  <block wx:elif="{{!loading && collection}}">
    <view class="header">
      <view class="header__title">{{collection.title}}</view>
      <view class="header__meta">
        <text class="header__date">{{collection.occurredOn}}</text>
        <text wx:if="{{collection.location}}" class="header__sep">·</text>
        <text wx:if="{{collection.location}}" class="header__location">{{collection.location}}</text>
      </view>
      <view wx:if="{{collection.description}}" class="header__desc">{{collection.description}}</view>
      <view wx:if="{{collection.tags.length}}" class="header__tags">
        <view wx:for="{{collection.tags}}" wx:key="id" class="chip">#{{item.displayName}}</view>
      </view>
      <view class="header__count">共 {{collection.photoCount}} 张</view>
    </view>

    <view class="grid">
      <view
        wx:for="{{collection.photos}}"
        wx:key="id"
        class="grid__cell"
        id="photo-{{item.id}}"
      >
        <photo-tile
          photoId="{{item.id}}"
          thumbnailUrl="{{item.thumbnailUrl}}"
          caption=""
          favoritedByMe="{{item.favoritedByMe}}"
          favoriteCount="{{item.favoriteCount}}"
          bind:tap="onPhotoTap"
          bind:favoritetap="onFavoriteToggle"
        />
      </view>
    </view>
  </block>
</view>
```

- [ ] **Step 3: Create `index.wxss`**

```css
.page { background: var(--paper-cream); min-height: 100vh; padding-bottom: 80rpx; }
.empty { padding: 200rpx 0; text-align: center; color: var(--ink-secondary); font-size: 26rpx; }
.header { padding: 32rpx 32rpx 24rpx; }
.header__title { font-size: 48rpx; color: var(--ink-primary); line-height: 1.2; }
.header__meta { margin-top: 12rpx; font-size: 26rpx; color: var(--ink-secondary); display: flex; gap: 12rpx; align-items: center; }
.header__sep { opacity: .5; }
.header__desc { margin-top: 16rpx; font-size: 28rpx; color: var(--ink-primary); line-height: 1.5; }
.header__tags { margin-top: 16rpx; display: flex; flex-wrap: wrap; gap: 10rpx; }
.chip {
  padding: 6rpx 18rpx;
  background: var(--paper-aged);
  color: var(--ink-primary);
  border-radius: 999rpx;
  font-size: 22rpx;
}
.header__count { margin-top: 16rpx; font-size: 22rpx; color: var(--ink-secondary); }
.grid {
  padding: 16rpx;
  column-count: 2;
  column-gap: 16rpx;
}
.grid__cell {
  break-inside: avoid;
  margin-bottom: 24rpx;
}
```

- [ ] **Step 4: Create `index.ts`**

```typescript
import type { CollectionDetailDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';

Page({
  data: {
    collection: null as CollectionDetailDTO | null,
    loading: false,
    initialPhotoId: '' as string,
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = decodeURIComponent(query.id ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    this.setData({ initialPhotoId: photoId });
    if (!id) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      return;
    }
    void this.fetch(id);
  },

  async fetch(id: string) {
    this.setData({ loading: true });
    try {
      const collection = await collectionsService.get(id);
      this.setData({ collection });
      if (this.data.initialPhotoId) {
        wx.pageScrollTo({ selector: `#photo-${this.data.initialPhotoId}`, duration: 200 });
      }
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onPhotoTap(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    if (!this.data.collection) return;
    wx.navigateTo({
      url: `/pkgCollection/viewer/index?collectionId=${encodeURIComponent(this.data.collection.id)}&photoId=${encodeURIComponent(e.detail.photoId)}`,
    });
  },

  async onFavoriteToggle(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    if (!this.data.collection) return;
    const photoId = e.detail.photoId;
    const idx = this.data.collection.photos.findIndex((p) => p.id === photoId);
    if (idx < 0) return;
    const photo = this.data.collection.photos[idx]!;
    const wasFav = photo.favoritedByMe;
    const updated = {
      ...photo,
      favoritedByMe: !wasFav,
      favoriteCount: photo.favoriteCount + (wasFav ? -1 : 1),
    };
    const newPhotos = [...this.data.collection.photos];
    newPhotos[idx] = updated;
    this.setData({ collection: { ...this.data.collection, photos: newPhotos } });

    try {
      if (wasFav) {
        await favoritesService.remove(photoId);
      } else {
        await favoritesService.add(photoId);
      }
    } catch {
      // revert
      const revertPhotos = [...this.data.collection!.photos];
      revertPhotos[idx] = photo;
      this.setData({ collection: { ...this.data.collection!, photos: revertPhotos } });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
```

- [ ] **Step 5: Verify tsc + build**

```bash
pnpm --filter @daynest/miniapp build
```

Expected: clean. (The `pkgCollection/detail` directory must be reachable from the `app.json` subpackage entry added in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/pkgCollection/detail
git commit -m "feat(miniapp): collection detail page (header + photo grid + favorite toggle)"
```

---

## Task 14: Photo viewer page (no-zoom baseline)

**Files:**
- Create: `apps/miniapp/miniprogram/pkgCollection/viewer/index.{ts,wxml,wxss,json}`

A `<swiper>` of the collection's photos. Loads the same collection that the source page loaded. The initial index is `photos.findIndex(p => p.id === photoId)`. Tap closes; long-press shows the native preview action sheet via `wx.previewImage`. Pinch zoom + cross-collection swipe + share + favorite-from-viewer all land in Plan 04.

- [ ] **Step 1: Create `index.json`**

```json
{
  "navigationBarTitleText": "查看照片",
  "navigationBarBackgroundColor": "#000000",
  "navigationBarTextStyle": "white",
  "usingComponents": {}
}
```

- [ ] **Step 2: Create `index.wxml`**

```html
<view class="viewer">
  <view wx:if="{{loading}}" class="empty">读取中…</view>
  <swiper
    wx:elif="{{photos.length > 0}}"
    class="swiper"
    current="{{current}}"
    bindchange="onChange"
    duration="300"
    easing-function="easeInOutCubic"
  >
    <swiper-item wx:for="{{photos}}" wx:key="id">
      <view class="slide" bindlongpress="onLongPress" data-url="{{item.thumbnailUrl}}">
        <image
          class="slide__img"
          src="{{item.thumbnailUrl}}"
          mode="aspectFit"
          lazy-load="true"
        />
        <view wx:if="{{item.caption}}" class="slide__caption">{{item.caption}}</view>
      </view>
    </swiper-item>
  </swiper>
  <view wx:if="{{photos.length > 0}}" class="counter">{{current + 1}} / {{photos.length}}</view>
</view>
```

- [ ] **Step 3: Create `index.wxss`**

```css
.viewer {
  width: 100vw;
  height: 100vh;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty { color: #888; font-size: 26rpx; }
.swiper {
  width: 100%;
  height: 100%;
}
.slide {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.slide__img {
  width: 100%;
  height: 100%;
}
.slide__caption {
  position: absolute;
  bottom: 80rpx;
  left: 40rpx;
  right: 40rpx;
  text-align: center;
  font-size: 24rpx;
  color: #fff;
  background: rgba(0,0,0,.5);
  padding: 12rpx 20rpx;
  border-radius: 8rpx;
}
.counter {
  position: absolute;
  top: 40rpx;
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  font-size: 24rpx;
  background: rgba(0,0,0,.5);
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  z-index: 10;
}
```

- [ ] **Step 4: Create `index.ts`**

```typescript
import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';

Page({
  data: {
    photos: [] as PhotoDTO[],
    current: 0,
    loading: true,
  },

  onLoad(query: Record<string, string | undefined>) {
    const collectionId = decodeURIComponent(query.collectionId ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    if (!collectionId) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      return;
    }
    void this.load(collectionId, photoId);
  },

  async load(collectionId: string, photoId: string) {
    try {
      const collection = await collectionsService.get(collectionId);
      const idx = photoId
        ? collection.photos.findIndex((p) => p.id === photoId)
        : 0;
      this.setData({
        photos: collection.photos,
        current: idx >= 0 ? idx : 0,
        loading: false,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onChange(e: WechatMiniprogram.SwiperChange) {
    this.setData({ current: e.detail.current });
  },

  onLongPress(e: WechatMiniprogram.TouchEvent) {
    const urls = this.data.photos.map((p) => p.thumbnailUrl);
    wx.previewImage({
      current: this.data.photos[this.data.current]?.thumbnailUrl,
      urls,
    });
  },
});
```

- [ ] **Step 5: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/pkgCollection/viewer
git commit -m "feat(miniapp): photo viewer baseline (swiper + counter + long-press preview)"
```

---

## Task 15: End-to-end browse smoke test

**Files:**
- Create: `apps/api/tests/wechat/miniapp-browse.test.ts`

Following Plan 02's pattern: the smoke test lives on the api side because `buildApp` shells out to Prisma migrate (cwd=apps/api). It exercises the **service layer** of the miniapp against a real Fastify instance, seeding a user + collection + photos + favorite.

This is NOT a UI smoke test — it doesn't try to invoke `Page({...})` lifecycle. It proves the wire format between `miniapp/lib/services/*` and `apps/api` matches.

- [ ] **Step 1: Add the test exclusion**

Edit `apps/api/tsconfig.json` — extend the `exclude` list:

```json
{
  "exclude": [
    "tests/wechat/miniapp-integration.test.ts",
    "tests/wechat/miniapp-browse.test.ts"
  ]
}
```

(The pre-existing entry already covers Plan 02's integration test. Add the new one to keep the same `tsc` skip — both files cross-import miniapp source.)

- [ ] **Step 2: Create the smoke test**

`apps/api/tests/wechat/miniapp-browse.test.ts`:

```typescript
// Cross-package integration test that imports miniapp source. Excluded from
// the api's tsc build via tsconfig.json#exclude (vitest still runs it via
// esbuild). See sibling miniapp-integration.test.ts for the rationale.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signAccess } from '../../src/auth/jwt.js';
import { installWxMock, uninstallWxMock, type WxMock } from '../../../miniapp/tests/helpers/wxMock.js';
import { authStore } from '../../../miniapp/miniprogram/stores/authStore.js';
import { collectionsService } from '../../../miniapp/miniprogram/lib/services/collections.js';
import { favoritesService } from '../../../miniapp/miniprogram/lib/services/favorites.js';
import { tagsService } from '../../../miniapp/miniprogram/lib/services/tags.js';

describe('miniapp browse — end-to-end via real Fastify', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;
  let accessToken: string;

  beforeEach(async () => {
    mock = installWxMock();
    ctx = await buildApp();
    authStore.reset();

    const user = await ctx.prisma.user.create({
      data: {
        username: 'browser',
        displayName: 'Browser',
        passwordHash: await hashPassword('browserpw123'),
      },
    });
    userId = user.id;
    accessToken = await signAccess(
      { sub: user.id },
      ctx.config.jwt.secret,
      ctx.config.jwt.accessTtl,
    );
    authStore.setTokens(accessToken, 'refresh-stub');

    // Rewire wx.request to route to Fastify.inject
    (globalThis as Record<string, unknown>).wx = {
      ...((globalThis as Record<string, unknown>).wx as object),
      getStorageSync: (k: string) => mock.storage.get(k) ?? '',
      setStorageSync: (k: string, v: unknown) => { mock.storage.set(k, v); },
      removeStorageSync: (k: string) => { mock.storage.delete(k); },
      request: (o: {
        url: string;
        method?: string;
        data?: unknown;
        header?: Record<string, string>;
        success: (r: { statusCode: number; data: unknown }) => void;
        fail: (e: unknown) => void;
      }) => {
        const u = new URL(o.url);
        ctx.app.inject({
          method: (o.method ?? 'GET') as 'GET' | 'POST' | 'DELETE' | 'PATCH',
          url: u.pathname + u.search,
          payload: o.data as Record<string, unknown> | undefined,
          headers: o.header,
        }).then((res) => {
          let data: unknown = {};
          try { data = res.json(); } catch { data = {}; }
          o.success({ statusCode: res.statusCode, data });
        }).catch(o.fail);
        return { abort: () => undefined };
      },
    };
  });

  afterEach(async () => {
    uninstallWxMock();
    await ctx.cleanup();
  });

  async function seedCollection(title: string, photoCount = 3) {
    const collection = await ctx.prisma.collection.create({
      data: {
        title,
        occurredOn: new Date('2026-05-01'),
        createdById: userId,
        photoCount,
      },
    });
    const photos = [];
    for (let i = 0; i < photoCount; i++) {
      const p = await ctx.prisma.photo.create({
        data: {
          collectionId: collection.id,
          fileKey: `k-${collection.id}-${i}`,
          width: 1000,
          height: 750,
          caption: null,
          takenAt: null,
          orderIndex: i,
          uploadedById: userId,
        },
      });
      photos.push(p);
    }
    return { collection, photos };
  }

  it('collectionsService.list() returns seeded collections', async () => {
    await seedCollection('Spring trip', 4);
    await seedCollection('Birthday', 2);

    const res = await collectionsService.list({ limit: 20 });
    expect(res.items.length).toBe(2);
    const titles = res.items.map((c) => c.title).sort();
    expect(titles).toEqual(['Birthday', 'Spring trip']);
  });

  it('collectionsService.list({ title }) fuzzy-matches by title', async () => {
    await seedCollection('Spring trip', 2);
    await seedCollection('Summer beach', 2);

    const res = await collectionsService.list({ title: 'Spring', limit: 20 });
    expect(res.items.length).toBe(1);
    expect(res.items[0]?.title).toBe('Spring trip');
  });

  it('collectionsService.get(id) returns photos', async () => {
    const { collection } = await seedCollection('detail-test', 3);
    const res = await collectionsService.get(collection.id);
    expect(res.title).toBe('detail-test');
    expect(res.photos.length).toBe(3);
  });

  it('favoritesService.add/remove toggles favorite state', async () => {
    const { photos } = await seedCollection('fav-test', 2);
    const target = photos[0]!;

    await favoritesService.add(target.id);
    const after = await ctx.prisma.photoFavorite.findUnique({
      where: { photoId_userId: { photoId: target.id, userId } },
    });
    expect(after).not.toBeNull();

    await favoritesService.remove(target.id);
    const removed = await ctx.prisma.photoFavorite.findUnique({
      where: { photoId_userId: { photoId: target.id, userId } },
    });
    expect(removed).toBeNull();
  });

  it('favoritesService.list() returns favorited photos in newest-first order', async () => {
    const { photos } = await seedCollection('fav-list', 3);
    for (const p of photos) {
      await ctx.prisma.photoFavorite.create({
        data: { photoId: p.id, userId },
      });
      // Small delay so createdAt differs measurably.
      await new Promise((r) => setTimeout(r, 5));
    }
    const res = await favoritesService.list({ limit: 30 });
    expect(res.items.length).toBe(3);
    // Last-added photo should come first.
    expect(res.items[0]?.photo.id).toBe(photos[2]!.id);
  });

  it('tagsService.list() returns all tags with counts', async () => {
    const tag = await ctx.prisma.tag.create({
      data: { name: 'travel', displayName: 'Travel', createdById: userId },
    });
    const { collection } = await seedCollection('tag-test', 1);
    await ctx.prisma.collectionTag.create({
      data: { collectionId: collection.id, tagId: tag.id },
    });

    const res = await tagsService.list();
    expect(res.length).toBe(1);
    expect(res[0]?.displayName).toBe('Travel');
    expect(res[0]?.collectionCount).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm --filter @daynest/api test -- miniapp-browse
```

Expected: 6 tests pass.

- [ ] **Step 4: Run the full api suite**

```bash
pnpm --filter @daynest/api test
```

Expected: previous **156** + 6 new = **162** tests pass.

- [ ] **Step 5: Run the miniapp suite**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: still **56** tests pass (unchanged — this task only adds to api).

- [ ] **Step 6: Run tsc across all three packages**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/api build
pnpm --filter @daynest/shared build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/tests/wechat/miniapp-browse.test.ts apps/api/tsconfig.json
git commit -m "test(miniapp): end-to-end browse smoke test against real Fastify"
```

---

## Post-plan verification (manual)

These steps come AFTER the 15 commits and need WeChat DevTools.

1. Refresh tokens generator (if you regenerated design tokens):
   ```bash
   pnpm --filter @daynest/shared build
   pnpm --filter @daynest/miniapp tokens
   ```

2. Start the API server:
   ```bash
   pnpm --filter @daynest/api dev
   ```

3. Open WeChat DevTools → `apps/miniapp/` → 不校验合法域名 (for localhost dev).

4. Manual checks:
   - Login → land on timeline.
   - Timeline shows seeded collections (use the dev seed or upload via web).
   - Tap a collection card → detail page loads with the photo grid.
   - Tap a photo → viewer opens, swipe between photos works.
   - Long-press a photo in the viewer → native `wx.previewImage` action sheet.
   - Back to detail → tap heart on a photo → toast or visual state flips; refresh and verify it stuck.
   - Tab over to Favorites → seeded favorite appears; tap heart → it disappears (optimistic), then a refresh confirms.
   - Tab over to Tags → if any tags exist, they appear in popular and the flat / categorized views.
   - Custom date filter on timeline picker → list refreshes with matching collections.

---

## Self-Review

**Spec coverage** (against `2026-05-22-miniapp-design.md`):
- §3.2 Timeline / Favorites / Tags overview / Collection detail / Photo viewer — Tasks 10, 11, 12, 13, 14 ✅
- §3.2 Tag pinboard + rename — explicit out of scope (Plan 04) ✅
- §3.4 preloadRule for `pkgCollection` — Task 2 ✅
- §4.3 polaroid frame — Task 3 ✅
- §4.7 stacked polaroid — Task 7 ✅
- §4.8 timeline rail (vertical dashed line + dots) — Task 10 (`.row::before`) ✅
- Spec §3.2 mentions a tag pinboard at `/pkgTags/pinboard/index`. The tags overview's tap handler shows "标签详情即将上线" until Plan 04 ships the pinboard. ✅

**Placeholder scan:**
- No "TODO" / "later" / "implement appropriate error handling" in any task body.
- All commands have expected output.
- All code blocks are complete (no `...`).

**Type consistency:**
- `CollectionSummaryDTO` / `CollectionDetailDTO` / `FavoriteEntryDTO` / `PhotoDTO` / `TagDTO` all imported from `@daynest/shared` exactly. Names match the package exports.
- `apiClient` from `services/_client.ts` consumed by all 4 services with identical pattern.
- `DatePreset` / `DateRange` types in `lib/dateRange.ts` consumed by `timeline-filters/index.ts`.
- `stableInt` / `stableAngle` from `lib/hash.ts` consumed by `stacked-polaroid/index.ts` and `photo-tile/index.ts`.

---

## Done criteria

After all 15 commits:
- `pnpm --filter @daynest/miniapp test` passes (56 tests across services + hash + dateRange + debounce + prior Plan 02 suites)
- `pnpm --filter @daynest/api test` passes (162 tests — 156 from before + 6 new browse smoke)
- `pnpm --filter @daynest/shared test` passes (22 tests — unchanged)
- `pnpm --filter @daynest/miniapp build` clean
- `pnpm --filter @daynest/api build` clean (with `miniapp-browse.test.ts` in `exclude`)
- `apps/miniapp/miniprogram/pkgCollection/` exists with `detail/` and `viewer/` subdirectories
- Manual DevTools verification (Post-plan section) succeeds with seeded data

—— end of plan
