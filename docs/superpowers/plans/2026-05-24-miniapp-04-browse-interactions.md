# Mini-Program v1 — Plan 04 · Browse Interactions (Viewer Zoom + Tag Pinboard + Rename)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer interactive polish onto the browse foundation from Plan 03. Add pinch-zoom + pan + a favourable / info overlay to the photo viewer; ship the tag pinboard and the inline tag-rename-with-merge flow so the Tags tab is no longer a dead-end. No backend changes — `PATCH /api/tags/:name` already returns `{ merged: boolean }` and `GET /api/collections` already supports `?tag=&tagScope=`.

**Architecture:**
- **Viewer** keeps its `<swiper>` shell. Each `<swiper-item>` swaps its `<image>` for a `<movable-area>` + `<movable-view>` pair (native WX components that implement bounded pan + pinch). A per-photo `scales[]` array tracks zoom state; the swiper's `disable-touch` flips whenever any photo is `> 1×` so horizontal pan inside the photo isn't stolen for navigation. Scales reset on swipe.
- **pkgTags** is a new subpackage hosting two pages: `pinboard/index` (collections under a tag, with a scope toggle) and `rename/index` (inline displayName edit + merge-confirmation modal).
- **`tagsService`** gains `rename(name, displayName)` (PATCH) — the only new service method.
- **Client-side `normalizeTagName`** mirrors the backend (`apps/api/src/services/tags.ts:5`) so the rename page can predict a merge collision before submitting.

**Tech Stack:** Native WXML/WXSS/JS · TypeScript · Vitest · `@daynest/shared` DTOs · existing Plan 02 + 03 infrastructure (`createApiClient`, `authStore`, `themeStore`, `collectionsService`, `tagsService`, `StackedPolaroid`, `PhotoTile`, `_http.ts`).

**Companion spec:** [`../specs/2026-05-22-miniapp-design.md`](../specs/2026-05-22-miniapp-design.md) — §3.2 (page tree, `pkgTags/pinboard`, `pkgTags/rename`), §4.10 (photo viewer interactions).

**Backend dependency:** All endpoints already on `main`:
- `GET /api/collections?tag=<name>&tagScope=all|collection|photo` — already supports the pinboard's scope filter.
- `PATCH /api/tags/:name` with `{ displayName }` — already returns `{ id, name, displayName, photoCount, collectionCount, merged: boolean }`.
- `GET /api/tags` — already returns the full tag list (used to predict merges client-side).

Plan 04 **does not touch `apps/api/`**.

**Scope of this plan:**
- ✅ Client `normalizeTagName` helper + tests
- ✅ `tagsService.rename` + tests
- ✅ `pkgTags/` subpackage scaffolding + preload rule
- ✅ Tag pinboard page (pkgTags/pinboard)
- ✅ Tag rename page with client-side collision detection + merge confirmation modal (pkgTags/rename)
- ✅ Wire Tags overview's `onTagTap` to navigate into the pinboard
- ✅ Viewer pinch-zoom + pan via `<movable-view>`, with swiper touch coordination
- ✅ Viewer favorite heart overlay (optimistic, mirrors detail page)
- ✅ Viewer info drawer (caption + takenAt + tags)
- ✅ End-to-end smoke test (pinboard list + rename happy + rename-merge)

**Out of scope (Plan 05 and later):**
- ❌ Upload pipeline / new-collection creation — Plan 05
- ❌ Subscribe-message prompts at favorite-time — Plan 05
- ❌ Settings page (profile, displayName edit) — Plan 05
- ❌ Invites page — Plan 05
- ❌ Share via `onShareAppMessage` — Plan 06 (release QA)
- ❌ Tag deletion UI (`DELETE /api/tags/:name` exists but no UI need surfaced yet)
- ❌ Real fonts — Plan 06

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `apps/miniapp/miniprogram/lib/tagName.ts` | `normalizeTagName(input)` mirror of api |
| `apps/miniapp/tests/lib/tagName.test.ts` | tagName tests |
| `apps/miniapp/tests/lib/services/tags.rename.test.ts` | tests for new `tagsService.rename` |
| `apps/miniapp/miniprogram/pkgTags/pinboard/index.{ts,wxml,wxss,json}` | Tag pinboard page |
| `apps/miniapp/miniprogram/pkgTags/rename/index.{ts,wxml,wxss,json}` | Tag rename page |
| `apps/api/tests/wechat/miniapp-tags.test.ts` | Cross-package E2E smoke test |

### Modified files

| Path | Change |
|---|---|
| `apps/miniapp/miniprogram/lib/services/tags.ts` | Add `tagsService.rename(name, displayName): Promise<TagRenameResponse>` |
| `apps/miniapp/miniprogram/app.json` | Register `pkgTags` subpackage + preload from `pages/tags/index` |
| `apps/miniapp/miniprogram/pages/tags/index.ts` | Replace toast in `onTagTap` with `wx.navigateTo` to pinboard |
| `apps/miniapp/miniprogram/pkgCollection/viewer/index.json` | Re-enable component-isolation if needed (no new component imports) |
| `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxml` | Replace `<image>` in `<swiper-item>` with `<movable-area>` + `<movable-view>`; add favorite heart overlay + info drawer toggle |
| `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxss` | Styles for movable-area, overlay buttons, info drawer |
| `apps/miniapp/miniprogram/pkgCollection/viewer/index.ts` | Track per-photo `scales[]`; flip `swiperDisabled` when any zoomed; reset on swipe; favorite toggle; info drawer state |
| `apps/api/tsconfig.json` | Add `tests/wechat/miniapp-tags.test.ts` to `exclude` |

### Files NOT touched
- `apps/api/src/**` — backend frozen
- `packages/shared/src/**` — no DTO changes (response already has `merged`)
- `apps/miniapp/miniprogram/pages/{timeline,favorites,me}/*` — Plan 03 final state
- `apps/miniapp/miniprogram/pkgCollection/detail/*` — Plan 03 final state
- `apps/miniapp/miniprogram/pages/{login,bind}/*` and `pkgOnboarding/*` — Plan 02 final state
- All Plan 03 components (`stacked-polaroid`, `photo-tile`, `timeline-filters`) — reused as-is

---

## Conventions

- **TDD where testable** — `tagName.ts`, `tagsService.rename`, and the api-side smoke test all get tests first.
- **Run tests:** `pnpm --filter @daynest/miniapp test` (miniapp), `pnpm --filter @daynest/api test` (api).
- **Typecheck:** `pnpm --filter @daynest/miniapp build` and `pnpm --filter @daynest/api build`.
- **API access discipline:** pages call `tagsService.rename` / `collectionsService.list`, never `apiClient.request` directly.
- **Component-import discipline:** every page using a Component declares it in `index.json` `usingComponents`. The pinboard reuses `stacked-polaroid`; the rename page uses no components.
- **WXSS units:** `rpx` only (except `1px` hairlines and `100vh`).
- **Commits:** Conventional Commits (`feat(miniapp):`, `test(miniapp):`).
- **Baseline before starting Plan 04:** miniapp 65 / api 162 / shared 22 passing; tsc clean across all three.

---

## Task 1: `lib/tagName.ts` normalizer + tests

**Files:**
- Create: `apps/miniapp/miniprogram/lib/tagName.ts`
- Create: `apps/miniapp/tests/lib/tagName.test.ts`

The api normalizes tag names via `input.trim().toLocaleLowerCase()` (see `apps/api/src/services/tags.ts:5`). The miniapp's rename page must predict a merge BEFORE submitting, which requires applying the same normalization client-side and comparing against the cached tag list's `name` field.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/tagName.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeTagName } from '../../miniprogram/lib/tagName.js';

describe('normalizeTagName', () => {
  it('lowercases and trims', () => {
    expect(normalizeTagName('  Travel  ')).toBe('travel');
    expect(normalizeTagName('BIRTHDAY')).toBe('birthday');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeTagName('   ')).toBe('');
    expect(normalizeTagName('')).toBe('');
  });

  it('preserves internal whitespace verbatim (matches api behaviour)', () => {
    expect(normalizeTagName('  Hello World  ')).toBe('hello world');
  });

  it('preserves CJK chars (no lowercasing applies)', () => {
    expect(normalizeTagName('  旅行  ')).toBe('旅行');
  });

  it('locale-aware lowercase for Turkish dotted-I', () => {
    // Sanity that we use toLocaleLowerCase (not toLowerCase). With no locale
    // arg the result depends on the runtime, but on Node/V8 with default
    // ICU 'İ'.toLocaleLowerCase() yields 'i̇' (i + combining dot) — that's
    // identical to the api behaviour. We only assert the function is a
    // pure delegate via a non-ASCII case.
    expect(normalizeTagName('  Café  ')).toBe('café');
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: 1 file fails with `Cannot find module '.../lib/tagName.js'`.

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/tagName.ts`**

```typescript
/**
 * Mirror of `apps/api/src/services/tags.ts#normalizeTagName`.
 *
 * Used by the rename page to predict a merge collision client-side before
 * submitting PATCH /api/tags/:name. Keep in lockstep with the api copy — if
 * the api ever changes its normalisation (e.g., Unicode NFC, dedup spaces),
 * update this and the test.
 */
export function normalizeTagName(input: string): string {
  return input.trim().toLocaleLowerCase();
}
```

- [ ] **Step 4: Run — must pass**

Expected: prior **65** + 5 new = **70**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/tagName.ts apps/miniapp/tests/lib/tagName.test.ts
git commit -m "feat(miniapp): client-side normalizeTagName mirror of api"
```

---

## Task 2: `tagsService.rename` + tests

**Files:**
- Modify: `apps/miniapp/miniprogram/lib/services/tags.ts`
- Create: `apps/miniapp/tests/lib/services/tags.rename.test.ts`

The PATCH endpoint accepts `{ displayName }` and returns the new/merged tag row plus a `merged: boolean` flag. The service is a thin wrapper using the existing shared `apiClient` + `ensureOk` from `_http.ts`.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/services/tags.rename.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { tagsService } from '../../../miniprogram/lib/services/tags.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('tagsService.rename', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('hits PATCH /api/tags/<name> with { displayName }', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        id: 't1',
        name: 'birthday',
        displayName: 'Birthday',
        photoCount: 3,
        collectionCount: 1,
        merged: false,
      },
    });
    const res = await tagsService.rename('Birthday', 'Birthday');
    expect(res.merged).toBe(false);
    expect(res.displayName).toBe('Birthday');
    const req = mock.requests[0];
    expect(req?.method).toBe('PATCH');
    expect(req?.url).toMatch(/\/api\/tags\/Birthday$/);
    expect(req?.data).toEqual({ displayName: 'Birthday' });
  });

  it('URL-encodes the current normalized name', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        id: 't2',
        name: '生日',
        displayName: '生日',
        photoCount: 0,
        collectionCount: 0,
        merged: false,
      },
    });
    await tagsService.rename('生日', '生日');
    expect(mock.requests[0]?.url).toMatch(/\/api\/tags\/%E7%94%9F%E6%97%A5$/);
  });

  it('returns { merged: true } when the api merges', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        id: 't3',
        name: 'travel',
        displayName: 'Travel',
        photoCount: 10,
        collectionCount: 4,
        merged: true,
      },
    });
    const res = await tagsService.rename('Trip', 'Travel');
    expect(res.merged).toBe(true);
    expect(res.id).toBe('t3');
  });

  it('throws on non-2xx with the api error code in the message', async () => {
    mock.queueResponse({
      statusCode: 404,
      data: { error: { code: 'TAG_NOT_FOUND' } },
    });
    await expect(tagsService.rename('ghost', 'New')).rejects.toThrow(/TAG_NOT_FOUND/);
  });
});
```

- [ ] **Step 2: Run — must fail**

Expected: 1 file fails with `tagsService.rename is not a function`.

- [ ] **Step 3: Extend `apps/miniapp/miniprogram/lib/services/tags.ts`**

Replace the current file contents with:

```typescript
import type { TagDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';
import { ensureOk } from './_http.js';

export interface TagRenameResponse extends TagDTO {
  merged: boolean;
}

export const tagsService = {
  async list(): Promise<TagDTO[]> {
    const url = `${resolveApiBase()}/api/tags`;
    const res = await apiClient.request<TagDTO[]>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async rename(currentName: string, displayName: string): Promise<TagRenameResponse> {
    const url = `${resolveApiBase()}/api/tags/${encodeURIComponent(currentName)}`;
    const res = await apiClient.request<TagRenameResponse>({
      url,
      method: 'PATCH',
      data: { displayName },
    });
    ensureOk('PATCH', url, res.statusCode, res.data);
    return res.data;
  },
};
```

- [ ] **Step 4: Run — must pass**

Expected: 70 + 4 = **74 passing**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/services/tags.ts apps/miniapp/tests/lib/services/tags.rename.test.ts
git commit -m "feat(miniapp): tagsService.rename (PATCH /api/tags/:name) with merge flag"
```

---

## Task 3: `pkgTags` subpackage + app.json registration

**Files:**
- Modify: `apps/miniapp/miniprogram/app.json`

Register the new subpackage and add a wifi-only preload rule from the tags overview tab.

- [ ] **Step 1: Extend the `subPackages` array**

```json
{
  "subPackages": [
    { "root": "pkgOnboarding/", "name": "pkgOnboarding", "pages": ["register/index"] },
    { "root": "pkgCollection/", "name": "pkgCollection", "pages": ["detail/index", "viewer/index"] },
    { "root": "pkgTags/", "name": "pkgTags", "pages": ["pinboard/index", "rename/index"] }
  ]
}
```

- [ ] **Step 2: Extend `preloadRule`**

```json
{
  "preloadRule": {
    "pages/timeline/index": { "network": "wifi", "packages": ["pkgCollection"] },
    "pages/tags/index": { "network": "wifi", "packages": ["pkgTags"] }
  }
}
```

(Both rules together — the wifi-only constraint is the same as `pkgCollection`'s.)

- [ ] **Step 3: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

The WX-app.json schema is enforced by DevTools (not tsc), so this command stays clean.

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/app.json
git commit -m "chore(miniapp): register pkgTags subpackage + wifi-preload from tags overview"
```

---

## Task 4: Tag pinboard page (`pkgTags/pinboard/index`)

**Files:**
- Create: `apps/miniapp/miniprogram/pkgTags/pinboard/index.{ts,wxml,wxss,json}`

Shows collections that reference a given tag. URL: `/pkgTags/pinboard/index?tag=<name>&scope=<all|collection|photo>`. The header shows the tag name + a scope toggle + an "edit" entry that navigates to the rename page. The body reuses `stacked-polaroid` cards (same component as the timeline). Pull-to-refresh + infinite scroll.

- [ ] **Step 1: Create `index.json`**

```json
{
  "navigationBarTitleText": "标签",
  "enablePullDownRefresh": true,
  "usingComponents": {
    "stacked-polaroid": "/components/stacked-polaroid/index"
  }
}
```

- [ ] **Step 2: Create `index.wxml`**

```html
<view class="page">
  <view class="header">
    <view class="header__line">
      <view class="header__title">#{{tagDisplay || tagName}}</view>
      <view class="header__edit" bindtap="onEditTap">编辑</view>
    </view>
    <view class="header__scope">
      <view
        wx:for="{{scopes}}"
        wx:key="key"
        class="seg {{scope === item.key ? 'seg--on' : ''}}"
        data-key="{{item.key}}"
        bindtap="onScopeTap"
      >{{item.label}}</view>
    </view>
  </view>

  <view wx:if="{{loading && items.length === 0}}" class="empty">读取中…</view>
  <view wx:elif="{{!loading && items.length === 0}}" class="empty">该标签下还没有集合</view>

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
      <stacked-polaroid
        previewPhotos="{{item.previewPhotos}}"
        photoCount="{{item.photoCount}}"
        caption="{{item.title}}"
      />
      <view class="row__meta">
        <text class="row__date">{{item.occurredOn}}</text>
        <text wx:if="{{item.location}}" class="row__sep">·</text>
        <text wx:if="{{item.location}}" class="row__location">{{item.location}}</text>
      </view>
    </view>
    <view wx:if="{{loadingMore}}" class="footer">加载更多…</view>
    <view wx:elif="{{!nextCursor && items.length > 0}}" class="footer">到底了</view>
  </scroll-view>
</view>
```

- [ ] **Step 3: Create `index.wxss`**

```css
.page { background: var(--paper-cream); min-height: 100vh; display: flex; flex-direction: column; }
.header { padding: 24rpx 32rpx 16rpx; }
.header__line { display: flex; align-items: baseline; justify-content: space-between; }
.header__title { font-size: 44rpx; color: var(--ink-primary); }
.header__edit { font-size: 24rpx; color: var(--ink-secondary); padding: 8rpx 16rpx; }
.header__scope { display: flex; gap: 12rpx; margin-top: 14rpx; }
.seg {
  padding: 8rpx 22rpx;
  border: 1px solid var(--paper-aged);
  border-radius: 999rpx;
  font-size: 22rpx;
  color: var(--ink-secondary);
}
.seg--on { background: var(--ink-primary); color: var(--paper-cream); border-color: var(--ink-primary); }
.empty { padding: 200rpx 0; text-align: center; color: var(--ink-secondary); font-size: 26rpx; }
.list { flex: 1; padding: 16rpx 24rpx 120rpx; }
.row { display: flex; flex-direction: column; gap: 12rpx; padding: 24rpx 0; }
.row__meta { display: flex; align-items: center; gap: 12rpx; font-size: 22rpx; color: var(--ink-secondary); }
.row__sep { opacity: .5; }
.footer { padding: 32rpx 0; text-align: center; color: var(--ink-secondary); font-size: 24rpx; }
```

- [ ] **Step 4: Create `index.ts`**

```typescript
import type { CollectionSummaryDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';

type Scope = 'all' | 'collection' | 'photo';

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'collection', label: '集合标签' },
  { key: 'photo', label: '照片标签' },
];

Page({
  data: {
    tagName: '' as string,
    tagDisplay: '' as string,
    scopes: SCOPES,
    scope: 'all' as Scope,
    items: [] as CollectionSummaryDTO[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const tag = decodeURIComponent(query.tag ?? '');
    const display = decodeURIComponent(query.display ?? tag);
    const scope = ((query.scope as Scope) || 'all');
    this.setData({ tagName: tag, tagDisplay: display, scope });
    if (!tag) {
      wx.showToast({ title: '缺少标签名', icon: 'none' });
      return;
    }
    void this.refresh();
  },

  onPullDownRefresh() {
    void this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (!this.data.tagName || this.data.loading) return;
    this.setData({ loading: true, items: [], nextCursor: null });
    try {
      const res = await collectionsService.list({
        limit: 20,
        tag: this.data.tagName,
        tagScope: this.data.scope,
      });
      this.setData({ items: res.items, nextCursor: res.nextCursor });
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
      const res = await collectionsService.list({
        limit: 20,
        cursor: this.data.nextCursor,
        tag: this.data.tagName,
        tagScope: this.data.scope,
      });
      this.setData({
        items: [...this.data.items, ...res.items],
        nextCursor: res.nextCursor,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onScopeTap(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as Scope;
    if (key === this.data.scope) return;
    this.setData({ scope: key });
    void this.refresh();
  },

  onCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pkgCollection/detail/index?id=${encodeURIComponent(id)}` });
  },

  onEditTap() {
    wx.navigateTo({
      url: `/pkgTags/rename/index?tag=${encodeURIComponent(this.data.tagName)}&display=${encodeURIComponent(this.data.tagDisplay)}`,
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
git add apps/miniapp/miniprogram/pkgTags/pinboard
git commit -m "feat(miniapp): tag pinboard page (collections under tag + scope toggle)"
```

---

## Task 5: Tag rename page with merge confirmation

**Files:**
- Create: `apps/miniapp/miniprogram/pkgTags/rename/index.{ts,wxml,wxss,json}`

Inline edit of a tag's display name. Before PATCH, the page normalises the typed value and checks against the cached `tagsService.list()` result. If a collision is detected, surface a `wx.showModal({ title: '已存在同名标签', content: '确认合并？...' })` confirmation. On submit success, navigate back to the pinboard with a toast (or to the tags overview if the user came from there).

- [ ] **Step 1: Create `index.json`**

```json
{ "navigationBarTitleText": "重命名标签", "usingComponents": {} }
```

- [ ] **Step 2: Create `index.wxml`**

```html
<view class="page">
  <view class="card">
    <view class="card__label">原标签</view>
    <view class="card__original">#{{originalDisplay || tagName}}</view>

    <view class="card__label">新名称</view>
    <input
      class="card__input"
      placeholder="输入新名称"
      value="{{newDisplay}}"
      bindinput="onInput"
      maxlength="60"
      focus="{{true}}"
    />

    <view wx:if="{{collisionDisplay}}" class="hint hint--warn">
      已存在 #{{collisionDisplay}} —— 保存后两个标签将合并
    </view>
    <view wx:elif="{{newNormalized && newNormalized !== originalNormalized}}" class="hint">
      保存后将更名
    </view>

    <button
      class="card__submit {{canSubmit ? '' : 'card__submit--disabled'}}"
      bindtap="onSubmit"
      disabled="{{!canSubmit || submitting}}"
    >{{submitting ? '保存中…' : '保存'}}</button>
  </view>
</view>
```

- [ ] **Step 3: Create `index.wxss`**

```css
.page { background: var(--paper-cream); min-height: 100vh; padding: 32rpx 32rpx 120rpx; }
.card {
  background: #FFFCF5;
  border-radius: 12rpx;
  padding: 32rpx;
  box-shadow: var(--shadow-polaroid);
}
.card__label { font-size: 22rpx; color: var(--ink-secondary); margin-bottom: 8rpx; }
.card__original {
  font-size: 36rpx;
  color: var(--ink-primary);
  margin-bottom: 24rpx;
}
.card__input {
  background: var(--paper-cream);
  border: 1px solid var(--paper-aged);
  border-radius: 8rpx;
  padding: 16rpx 24rpx;
  font-size: 28rpx;
  color: var(--ink-primary);
  margin-bottom: 16rpx;
}
.hint { font-size: 24rpx; color: var(--ink-secondary); margin-bottom: 16rpx; }
.hint--warn { color: var(--ink-sticker); }
.card__submit {
  background: var(--ink-primary);
  color: var(--paper-cream);
  border-radius: 999rpx;
  font-size: 28rpx;
  padding: 18rpx 0;
  margin-top: 16rpx;
}
.card__submit--disabled {
  background: var(--paper-aged);
  color: var(--ink-secondary);
}
```

- [ ] **Step 4: Create `index.ts`**

```typescript
import type { TagDTO } from '@daynest/shared';
import { tagsService } from '../../lib/services/tags.js';
import { normalizeTagName } from '../../lib/tagName.js';

interface PageData {
  tagName: string;
  originalDisplay: string;
  originalNormalized: string;
  newDisplay: string;
  newNormalized: string;
  collisionDisplay: string;
  canSubmit: boolean;
  submitting: boolean;
  allTags: TagDTO[];
}

Page({
  data: {
    tagName: '',
    originalDisplay: '',
    originalNormalized: '',
    newDisplay: '',
    newNormalized: '',
    collisionDisplay: '',
    canSubmit: false,
    submitting: false,
    allTags: [],
  } as PageData,

  async onLoad(query: Record<string, string | undefined>) {
    const tag = decodeURIComponent(query.tag ?? '');
    const display = decodeURIComponent(query.display ?? tag);
    if (!tag) {
      wx.showToast({ title: '缺少标签名', icon: 'none' });
      return;
    }
    this.setData({
      tagName: tag,
      originalDisplay: display,
      originalNormalized: normalizeTagName(display),
      newDisplay: display,
      newNormalized: normalizeTagName(display),
    });
    this.recomputeCollision();
    // Preload the tag list so we can detect a merge collision client-side.
    try {
      const tags = await tagsService.list();
      this.setData({ allTags: tags });
      this.recomputeCollision();
    } catch {
      // Non-fatal — the api still enforces the merge on the server.
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value;
    this.setData({
      newDisplay: v,
      newNormalized: normalizeTagName(v),
    });
    this.recomputeCollision();
  },

  recomputeCollision() {
    const { newNormalized, originalNormalized, allTags } = this.data;
    const trimmed = newNormalized.trim();
    const sameAsOriginal = trimmed === originalNormalized;
    let collisionDisplay = '';
    if (trimmed && !sameAsOriginal) {
      const hit = allTags.find((t) => t.name === trimmed);
      collisionDisplay = hit ? hit.displayName : '';
    }
    this.setData({
      collisionDisplay,
      canSubmit: trimmed.length > 0 && this.data.newDisplay.trim().length > 0,
    });
  },

  async onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return;
    const display = this.data.newDisplay.trim();
    if (display === this.data.originalDisplay.trim()) {
      wx.navigateBack();
      return;
    }

    // Confirm BEFORE sending if we predict a merge.
    if (this.data.collisionDisplay) {
      const ok = await new Promise<boolean>((resolve) => {
        wx.showModal({
          title: '合并到已存在标签',
          content: `保存后 #${this.data.originalDisplay} 将与 #${this.data.collisionDisplay} 合并。该操作无法撤销。`,
          confirmText: '合并',
          success: (r) => resolve(r.confirm === true),
          fail: () => resolve(false),
        });
      });
      if (!ok) return;
    }

    this.setData({ submitting: true });
    try {
      const res = await tagsService.rename(this.data.tagName, display);
      wx.showToast({
        title: res.merged ? '合并完成' : '已更新',
        icon: 'success',
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 600);
    } catch {
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
```

- [ ] **Step 5: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/pkgTags/rename
git commit -m "feat(miniapp): tag rename page with client-side merge prediction + modal"
```

---

## Task 6: Wire Tags overview to pinboard

**Files:**
- Modify: `apps/miniapp/miniprogram/pages/tags/index.ts`

Currently `onTagTap` shows the placeholder toast `标签详情即将上线`. Replace it with `wx.navigateTo('/pkgTags/pinboard/index?tag=...&display=...')`.

- [ ] **Step 1: Update the handler**

In `apps/miniapp/miniprogram/pages/tags/index.ts`, locate the current `onTagTap` block:

```typescript
  onTagTap() {
    wx.showToast({ title: '标签详情即将上线', icon: 'none' });
  },
```

Replace with:

```typescript
  onTagTap(e: WechatMiniprogram.TouchEvent) {
    const name = e.currentTarget.dataset.name as string;
    if (!name) return;
    const tag = this.data.tags.find((t) => t.name === name);
    const display = tag?.displayName ?? name;
    wx.navigateTo({
      url: `/pkgTags/pinboard/index?tag=${encodeURIComponent(name)}&display=${encodeURIComponent(display)}`,
    });
  },
```

- [ ] **Step 2: Verify tsc + tests**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Still **74 passing** (no new tests in this task).

- [ ] **Step 3: Commit**

```bash
git add apps/miniapp/miniprogram/pages/tags/index.ts
git commit -m "feat(miniapp): tags overview taps navigate to pinboard"
```

---

## Task 7: Viewer pinch-zoom + pan via `<movable-view>`

**Files:**
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxml`
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxss`
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.ts`

Replace the per-slide `<image>` with `<movable-area scale="true">` + `<movable-view direction="all" scale scale-min scale-max>`. Track `scales[i]` per photo so the page can disable the swiper's horizontal pan when any photo is zoomed. Reset all scales to 1 on swipe.

Native `<movable-view>` handles both pinch + pan within bounds for us, including bounce-back. The `scale-area` attribute lets the user pinch the whole movable-area (not just the view) which feels more natural.

- [ ] **Step 1: Replace `index.wxml`**

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
    disable-touch="{{anyZoomed}}"
  >
    <swiper-item wx:for="{{photos}}" wx:key="id" wx:for-index="i">
      <movable-area class="ma" scale-area="{{true}}">
        <movable-view
          class="mv"
          direction="all"
          scale="{{true}}"
          scale-min="1"
          scale-max="3"
          scale-value="{{scales[i]}}"
          out-of-bounds="{{false}}"
          inertia="{{true}}"
          data-index="{{i}}"
          bindscale="onScale"
          bindlongpress="onLongPress"
        >
          <image class="mv__img" src="{{item.thumbnailUrl}}" mode="aspectFit" lazy-load="true" />
        </movable-view>
      </movable-area>
    </swiper-item>
  </swiper>

  <view wx:if="{{photos.length > 0}}" class="counter">{{current + 1}} / {{photos.length}}</view>
</view>
```

- [ ] **Step 2: Replace `index.wxss`**

Keep existing rules; add the movable-area / movable-view styles.

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
.swiper { width: 100%; height: 100%; }
.ma {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.mv {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mv__img {
  width: 100%;
  height: 100%;
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

(Removed the `.slide` / `.slide__img` / `.slide__caption` rules since the wxml no longer uses them.)

- [ ] **Step 3: Replace `index.ts`**

```typescript
import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';

const ZOOM_EPSILON = 0.05;

Page({
  data: {
    photos: [] as PhotoDTO[],
    current: 0,
    scales: [] as number[],
    anyZoomed: false,
    loading: true,
  },

  onLoad(query: Record<string, string | undefined>) {
    const collectionId = decodeURIComponent(query.collectionId ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    if (!collectionId) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    void this.load(collectionId, photoId);
  },

  async load(collectionId: string, photoId: string) {
    try {
      const collection = await collectionsService.get(collectionId);
      const idx = photoId ? collection.photos.findIndex((p) => p.id === photoId) : 0;
      this.setData({
        photos: collection.photos,
        current: idx >= 0 ? idx : 0,
        scales: collection.photos.map(() => 1),
        anyZoomed: false,
        loading: false,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    // Reset all scales when the user swipes; otherwise a half-zoomed slide
    // could persist its zoom state when revisited.
    const scales = this.data.photos.map(() => 1);
    this.setData({
      current: e.detail.current,
      scales,
      anyZoomed: false,
    });
  },

  onScale(e: WechatMiniprogram.CustomEvent<{ scale: number; x: number; y: number }>) {
    const idx = Number(e.currentTarget.dataset.index ?? 0);
    const next = [...this.data.scales];
    next[idx] = e.detail.scale;
    const anyZoomed = next.some((s) => s > 1 + ZOOM_EPSILON);
    this.setData({ scales: next, anyZoomed });
  },

  onLongPress(_e: WechatMiniprogram.TouchEvent) {
    const urls = this.data.photos.map((p) => p.thumbnailUrl);
    const current = this.data.photos[this.data.current]?.thumbnailUrl ?? urls[0];
    wx.previewImage({ current, urls });
  },
});
```

- [ ] **Step 4: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/pkgCollection/viewer
git commit -m "feat(miniapp): viewer pinch-zoom + pan via movable-view (swiper coordinated)"
```

---

## Task 8: Viewer favorite heart overlay

**Files:**
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxml`
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxss`
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.ts`

Add a heart icon (top-right, similar to `photo-tile`'s heart) reflecting `photos[current].favoritedByMe`. Tapping triggers optimistic toggle via `favoritesService.add/remove`. Reuses the `clip-path` heart path from `photo-tile`'s WXSS but inlined here (the viewer is dark-themed so colours differ).

- [ ] **Step 1: Extend `index.wxml`**

Add inside `.viewer` (above the closing `</view>`, after the `<view class="counter">`):

```html
<view class="heart {{currentFav.favoritedByMe ? 'heart--on' : ''}}" bindtap="onFavoriteTap">
  <view class="heart__shape"></view>
  <view wx:if="{{currentFav.favoriteCount > 0}}" class="heart__count">{{currentFav.favoriteCount}}</view>
</view>
```

- [ ] **Step 2: Extend `index.wxss`**

Append:

```css
.heart {
  position: absolute;
  top: 40rpx;
  right: 32rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 10rpx 18rpx;
  background: rgba(0,0,0,.5);
  border-radius: 999rpx;
  z-index: 10;
}
.heart__shape {
  width: 28rpx;
  height: 28rpx;
  background-color: #FFFCF5;
  clip-path: path('M14 25 L4 14 A6 6 0 0 1 14 6 A6 6 0 0 1 24 14 Z');
  opacity: .7;
}
.heart--on .heart__shape {
  background-color: var(--ink-sticker);
  opacity: 1;
}
.heart__count { font-size: 22rpx; color: #FFFCF5; }
```

- [ ] **Step 3: Extend `index.ts`**

At the top of `index.ts`, add the import:

```typescript
import { favoritesService } from '../../lib/services/favorites.js';
```

Add a `currentFav` computed property surfaced through `data` (since WXML can't compute), maintained by setting it whenever `current` or `photos` changes. The simplest pattern: a helper that recomputes `currentFav` into data.

Replace the existing `Page({...})` shape so it includes:

- A new `data` field `currentFav: { id: string; favoritedByMe: boolean; favoriteCount: number } | null` initialized to `null`.
- A helper `refreshCurrentFav()` that derives `currentFav` from `this.data.photos[this.data.current]` (or `null` if no photos).
- Call `refreshCurrentFav()` after every `setData` that changes `photos` or `current` (in `load` and in `onChange`).
- A new `onFavoriteTap` method that toggles optimistically.

Here is the consolidated `index.ts` (full replacement of the Task 7 version):

```typescript
import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';

const ZOOM_EPSILON = 0.05;

interface FavSnapshot {
  id: string;
  favoritedByMe: boolean;
  favoriteCount: number;
}

Page({
  data: {
    photos: [] as PhotoDTO[],
    current: 0,
    scales: [] as number[],
    anyZoomed: false,
    loading: true,
    currentFav: null as FavSnapshot | null,
  },

  onLoad(query: Record<string, string | undefined>) {
    const collectionId = decodeURIComponent(query.collectionId ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    if (!collectionId) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    void this.load(collectionId, photoId);
  },

  async load(collectionId: string, photoId: string) {
    try {
      const collection = await collectionsService.get(collectionId);
      const idx = photoId ? collection.photos.findIndex((p) => p.id === photoId) : 0;
      const current = idx >= 0 ? idx : 0;
      this.setData({
        photos: collection.photos,
        current,
        scales: collection.photos.map(() => 1),
        anyZoomed: false,
        loading: false,
        currentFav: this.snapshotFav(collection.photos, current),
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  snapshotFav(photos: PhotoDTO[], current: number): FavSnapshot | null {
    const p = photos[current];
    if (!p) return null;
    return { id: p.id, favoritedByMe: p.favoritedByMe, favoriteCount: p.favoriteCount };
  },

  onChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    const current = e.detail.current;
    const scales = this.data.photos.map(() => 1);
    this.setData({
      current,
      scales,
      anyZoomed: false,
      currentFav: this.snapshotFav(this.data.photos, current),
    });
  },

  onScale(e: WechatMiniprogram.CustomEvent<{ scale: number; x: number; y: number }>) {
    const idx = Number(e.currentTarget.dataset.index ?? 0);
    const next = [...this.data.scales];
    next[idx] = e.detail.scale;
    const anyZoomed = next.some((s) => s > 1 + ZOOM_EPSILON);
    this.setData({ scales: next, anyZoomed });
  },

  onLongPress(_e: WechatMiniprogram.TouchEvent) {
    const urls = this.data.photos.map((p) => p.thumbnailUrl);
    const current = this.data.photos[this.data.current]?.thumbnailUrl ?? urls[0];
    wx.previewImage({ current, urls });
  },

  async onFavoriteTap() {
    const idx = this.data.current;
    const photo = this.data.photos[idx];
    if (!photo) return;
    const wasFav = photo.favoritedByMe;
    const updated: PhotoDTO = {
      ...photo,
      favoritedByMe: !wasFav,
      favoriteCount: photo.favoriteCount + (wasFav ? -1 : 1),
    };
    const newPhotos = [...this.data.photos];
    newPhotos[idx] = updated;
    this.setData({
      photos: newPhotos,
      currentFav: this.snapshotFav(newPhotos, idx),
    });
    try {
      if (wasFav) {
        await favoritesService.remove(photo.id);
      } else {
        await favoritesService.add(photo.id);
      }
    } catch {
      // revert
      const revertPhotos = [...this.data.photos];
      revertPhotos[idx] = photo;
      this.setData({
        photos: revertPhotos,
        currentFav: this.snapshotFav(revertPhotos, idx),
      });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
```

- [ ] **Step 4: Verify tsc**

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/pkgCollection/viewer
git commit -m "feat(miniapp): viewer favorite heart overlay (optimistic toggle)"
```

---

## Task 9: Viewer info drawer

**Files:**
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxml`
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.wxss`
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.ts`

Add a small "ⓘ" button to the top-left corner. Tapping it slides up a bottom drawer with the current photo's caption (if any), `takenAt` (formatted), and tag chips. Tap-outside dismisses.

- [ ] **Step 1: Extend `index.wxml`**

Add inside `.viewer`:

```html
<view class="info-toggle" bindtap="onInfoToggle">
  <text class="info-toggle__icon">ⓘ</text>
</view>

<view wx:if="{{infoOpen}}" class="info-mask" bindtap="onInfoToggle">
  <view class="info-drawer" catchtap="onInfoNoop">
    <view wx:if="{{currentPhoto.caption}}" class="info__caption">{{currentPhoto.caption}}</view>
    <view class="info__row">
      <text class="info__label">拍摄于</text>
      <text class="info__value">{{currentPhoto.takenAt ? formatTakenAt(currentPhoto.takenAt) : '—'}}</text>
    </view>
    <view wx:if="{{currentPhoto.tags.length}}" class="info__tags">
      <view wx:for="{{currentPhoto.tags}}" wx:key="*this" class="info__tag">#{{item}}</view>
    </view>
  </view>
</view>
```

WXML can't call functions on the page; replace `formatTakenAt(currentPhoto.takenAt)` with a precomputed `currentTakenAtLabel` field driven from `data`. So change the row to:

```html
    <view class="info__row">
      <text class="info__label">拍摄于</text>
      <text class="info__value">{{currentTakenAtLabel || '—'}}</text>
    </view>
```

And replace `currentPhoto.caption` / `currentPhoto.tags` similarly with `data`-driven mirror values:

Final WXML for the drawer:

```html
<view class="info-toggle" bindtap="onInfoToggle">
  <text class="info-toggle__icon">ⓘ</text>
</view>

<view wx:if="{{infoOpen}}" class="info-mask" bindtap="onInfoToggle">
  <view class="info-drawer" catchtap="onInfoNoop">
    <view wx:if="{{currentCaption}}" class="info__caption">{{currentCaption}}</view>
    <view class="info__row">
      <text class="info__label">拍摄于</text>
      <text class="info__value">{{currentTakenAtLabel || '—'}}</text>
    </view>
    <view wx:if="{{currentTags.length > 0}}" class="info__tags">
      <view wx:for="{{currentTags}}" wx:key="*this" class="info__tag">#{{item}}</view>
    </view>
  </view>
</view>
```

- [ ] **Step 2: Extend `index.wxss`**

Append:

```css
.info-toggle {
  position: absolute;
  top: 40rpx;
  left: 32rpx;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: rgba(0,0,0,.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.info-toggle__icon { color: #FFFCF5; font-size: 30rpx; }

.info-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  z-index: 20;
  display: flex;
  align-items: flex-end;
}
.info-drawer {
  width: 100%;
  background: var(--paper-cream);
  border-radius: 24rpx 24rpx 0 0;
  padding: 32rpx 32rpx 64rpx;
  max-height: 70vh;
  overflow-y: auto;
}
.info__caption { font-size: 30rpx; color: var(--ink-primary); line-height: 1.5; margin-bottom: 16rpx; }
.info__row { display: flex; gap: 16rpx; font-size: 26rpx; margin-bottom: 12rpx; }
.info__label { color: var(--ink-secondary); }
.info__value { color: var(--ink-primary); }
.info__tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; }
.info__tag {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  background: var(--paper-aged);
  color: var(--ink-primary);
  border-radius: 999rpx;
}
```

- [ ] **Step 3: Extend `index.ts`**

Add data fields + a `refreshCurrentInfo()` helper that mirrors caption/tags/takenAt label from the current photo. Wire it into `load` and `onChange`, and add `onInfoToggle` / `onInfoNoop` methods.

Add a small date-formatter at the top of the file:

```typescript
function formatTakenAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return '';
  }
}
```

Replace the consolidated `Page({...})` from Task 8 with the version below — same structure plus the new info-drawer state. The complete final file (after Tasks 7+8+9 combined):

```typescript
import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';

const ZOOM_EPSILON = 0.05;

interface FavSnapshot {
  id: string;
  favoritedByMe: boolean;
  favoriteCount: number;
}

function formatTakenAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return '';
  }
}

Page({
  data: {
    photos: [] as PhotoDTO[],
    current: 0,
    scales: [] as number[],
    anyZoomed: false,
    loading: true,
    currentFav: null as FavSnapshot | null,
    currentCaption: '',
    currentTakenAtLabel: '',
    currentTags: [] as string[],
    infoOpen: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const collectionId = decodeURIComponent(query.collectionId ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    if (!collectionId) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    void this.load(collectionId, photoId);
  },

  async load(collectionId: string, photoId: string) {
    try {
      const collection = await collectionsService.get(collectionId);
      const idx = photoId ? collection.photos.findIndex((p) => p.id === photoId) : 0;
      const current = idx >= 0 ? idx : 0;
      this.setData({
        photos: collection.photos,
        current,
        scales: collection.photos.map(() => 1),
        anyZoomed: false,
        loading: false,
        ...this.deriveCurrent(collection.photos, current),
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  deriveCurrent(photos: PhotoDTO[], current: number) {
    const p = photos[current];
    if (!p) {
      return {
        currentFav: null as FavSnapshot | null,
        currentCaption: '',
        currentTakenAtLabel: '',
        currentTags: [] as string[],
      };
    }
    return {
      currentFav: {
        id: p.id,
        favoritedByMe: p.favoritedByMe,
        favoriteCount: p.favoriteCount,
      } as FavSnapshot,
      currentCaption: p.caption ?? '',
      currentTakenAtLabel: p.takenAt ? formatTakenAt(p.takenAt) : '',
      currentTags: p.tags ?? [],
    };
  },

  onChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    const current = e.detail.current;
    const scales = this.data.photos.map(() => 1);
    this.setData({
      current,
      scales,
      anyZoomed: false,
      infoOpen: false,
      ...this.deriveCurrent(this.data.photos, current),
    });
  },

  onScale(e: WechatMiniprogram.CustomEvent<{ scale: number; x: number; y: number }>) {
    const idx = Number(e.currentTarget.dataset.index ?? 0);
    const next = [...this.data.scales];
    next[idx] = e.detail.scale;
    const anyZoomed = next.some((s) => s > 1 + ZOOM_EPSILON);
    this.setData({ scales: next, anyZoomed });
  },

  onLongPress(_e: WechatMiniprogram.TouchEvent) {
    const urls = this.data.photos.map((p) => p.thumbnailUrl);
    const current = this.data.photos[this.data.current]?.thumbnailUrl ?? urls[0];
    wx.previewImage({ current, urls });
  },

  async onFavoriteTap() {
    const idx = this.data.current;
    const photo = this.data.photos[idx];
    if (!photo) return;
    const wasFav = photo.favoritedByMe;
    const updated: PhotoDTO = {
      ...photo,
      favoritedByMe: !wasFav,
      favoriteCount: photo.favoriteCount + (wasFav ? -1 : 1),
    };
    const newPhotos = [...this.data.photos];
    newPhotos[idx] = updated;
    this.setData({
      photos: newPhotos,
      ...this.deriveCurrent(newPhotos, idx),
    });
    try {
      if (wasFav) await favoritesService.remove(photo.id);
      else await favoritesService.add(photo.id);
    } catch {
      const revertPhotos = [...this.data.photos];
      revertPhotos[idx] = photo;
      this.setData({
        photos: revertPhotos,
        ...this.deriveCurrent(revertPhotos, idx),
      });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onInfoToggle() {
    this.setData({ infoOpen: !this.data.infoOpen });
  },

  onInfoNoop() {
    // Swallow taps inside the drawer so the mask's bindtap doesn't close it.
  },
});
```

- [ ] **Step 4: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/pkgCollection/viewer
git commit -m "feat(miniapp): viewer info drawer (caption + takenAt + tags)"
```

---

## Task 10: End-to-end smoke test

**Files:**
- Modify: `apps/api/tsconfig.json` (extend `exclude`)
- Create: `apps/api/tests/wechat/miniapp-tags.test.ts`

Cross-package E2E test mirroring the Plan 03 pattern. Exercises:
1. `collectionsService.list({ tag, tagScope })` — pinboard wire format
2. `tagsService.rename` happy path (renames in place)
3. `tagsService.rename` merge path (target name already exists → server merges, returns `merged: true`)

- [ ] **Step 1: Extend `apps/api/tsconfig.json#exclude`**

```json
{
  "exclude": [
    "tests/wechat/miniapp-integration.test.ts",
    "tests/wechat/miniapp-browse.test.ts",
    "tests/wechat/miniapp-tags.test.ts"
  ]
}
```

(Preserve any other entries from the current file.)

- [ ] **Step 2: Create the smoke test**

`apps/api/tests/wechat/miniapp-tags.test.ts`:

```typescript
// Cross-package integration test that imports miniapp source. Excluded from
// the api's tsc build via tsconfig.json#exclude (vitest still runs it via
// esbuild). See sibling miniapp-browse.test.ts for the rationale.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signAccess } from '../../src/auth/jwt.js';
import { installWxMock, uninstallWxMock, type WxMock } from '../../../miniapp/tests/helpers/wxMock.js';
import { authStore } from '../../../miniapp/miniprogram/stores/authStore.js';
import { collectionsService } from '../../../miniapp/miniprogram/lib/services/collections.js';
import { tagsService } from '../../../miniapp/miniprogram/lib/services/tags.js';

describe('miniapp tags interactions — end-to-end via real Fastify', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;

  beforeEach(async () => {
    mock = installWxMock();
    ctx = await buildApp();
    authStore.reset();

    const user = await ctx.prisma.user.create({
      data: {
        username: 'taguser',
        displayName: 'Tag User',
        passwordHash: await hashPassword('tagpw1234567'),
      },
    });
    userId = user.id;
    const accessToken = await signAccess(
      { sub: user.id },
      ctx.config.jwt.secret,
      ctx.config.jwt.accessTtl,
    );
    authStore.setTokens(accessToken, 'refresh-stub');

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

  async function seedTagOnCollection(displayName: string, scope: 'collection' | 'photo') {
    const tag = await ctx.prisma.tag.create({
      data: {
        name: displayName.toLocaleLowerCase().trim(),
        displayName,
        createdById: userId,
      },
    });
    const collection = await ctx.prisma.collection.create({
      data: {
        title: `${displayName}-col`,
        occurredOn: new Date('2026-05-01'),
        createdById: userId,
        photoCount: 1,
      },
    });
    const photo = await ctx.prisma.photo.create({
      data: {
        collectionId: collection.id,
        fileKey: `k-${collection.id}-0`,
        width: 1000,
        height: 750,
        caption: null,
        takenAt: null,
        orderIndex: 0,
        uploadedById: userId,
      },
    });
    if (scope === 'collection') {
      await ctx.prisma.collectionTag.create({ data: { collectionId: collection.id, tagId: tag.id } });
    } else {
      await ctx.prisma.photoTag.create({ data: { photoId: photo.id, tagId: tag.id } });
    }
    return { tag, collection, photo };
  }

  it('collectionsService.list({ tag, tagScope: "all" }) returns both collection- and photo-tagged collections', async () => {
    const { tag } = await seedTagOnCollection('travel', 'collection');
    const photoOnly = await ctx.prisma.collection.create({
      data: { title: 'photo-only', occurredOn: new Date('2026-05-02'), createdById: userId, photoCount: 1 },
    });
    const ph = await ctx.prisma.photo.create({
      data: { collectionId: photoOnly.id, fileKey: 'k-x-0', width: 1000, height: 750, caption: null, takenAt: null, orderIndex: 0, uploadedById: userId },
    });
    await ctx.prisma.photoTag.create({ data: { photoId: ph.id, tagId: tag.id } });

    const res = await collectionsService.list({ tag: 'travel', tagScope: 'all', limit: 20 });
    const titles = res.items.map((c) => c.title).sort();
    expect(titles).toEqual(['photo-only', 'travel-col']);
  });

  it('collectionsService.list({ tag, tagScope: "collection" }) filters to collection-level tags only', async () => {
    const { tag } = await seedTagOnCollection('travel', 'collection');
    const photoOnly = await ctx.prisma.collection.create({
      data: { title: 'photo-only', occurredOn: new Date('2026-05-02'), createdById: userId, photoCount: 1 },
    });
    const ph = await ctx.prisma.photo.create({
      data: { collectionId: photoOnly.id, fileKey: 'k-x-0', width: 1000, height: 750, caption: null, takenAt: null, orderIndex: 0, uploadedById: userId },
    });
    await ctx.prisma.photoTag.create({ data: { photoId: ph.id, tagId: tag.id } });

    const res = await collectionsService.list({ tag: 'travel', tagScope: 'collection', limit: 20 });
    expect(res.items.map((c) => c.title)).toEqual(['travel-col']);
  });

  it('collectionsService.list({ tag, tagScope: "photo" }) filters to photo-level tags only', async () => {
    const { tag } = await seedTagOnCollection('travel', 'collection');
    const photoOnly = await ctx.prisma.collection.create({
      data: { title: 'photo-only', occurredOn: new Date('2026-05-02'), createdById: userId, photoCount: 1 },
    });
    const ph = await ctx.prisma.photo.create({
      data: { collectionId: photoOnly.id, fileKey: 'k-x-0', width: 1000, height: 750, caption: null, takenAt: null, orderIndex: 0, uploadedById: userId },
    });
    await ctx.prisma.photoTag.create({ data: { photoId: ph.id, tagId: tag.id } });

    const res = await collectionsService.list({ tag: 'travel', tagScope: 'photo', limit: 20 });
    expect(res.items.map((c) => c.title)).toEqual(['photo-only']);
  });

  it('tagsService.rename happy path: updates displayName, returns merged: false', async () => {
    await seedTagOnCollection('travel', 'collection');

    const res = await tagsService.rename('travel', 'Travel');
    expect(res.merged).toBe(false);
    expect(res.displayName).toBe('Travel');
    expect(res.name).toBe('travel');

    const after = await ctx.prisma.tag.findUnique({ where: { name: 'travel' } });
    expect(after?.displayName).toBe('Travel');
  });

  it('tagsService.rename merges when the new normalized name already exists', async () => {
    const { tag: source } = await seedTagOnCollection('trip', 'collection');
    const { tag: target } = await seedTagOnCollection('travel', 'photo');

    const res = await tagsService.rename(source.name, 'travel');
    expect(res.merged).toBe(true);
    expect(res.id).toBe(target.id);
    expect(res.displayName).toBe('travel');

    // The source tag is gone.
    const gone = await ctx.prisma.tag.findUnique({ where: { id: source.id } });
    expect(gone).toBeNull();
    // The target tag now owns both join rows (the source's collection link
    // was migrated; the target's photo link was already there).
    const collectionLinks = await ctx.prisma.collectionTag.findMany({ where: { tagId: target.id } });
    expect(collectionLinks.length).toBe(1);
    const photoLinks = await ctx.prisma.photoTag.findMany({ where: { tagId: target.id } });
    expect(photoLinks.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run the new test only**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm --filter @daynest/api test -- miniapp-tags
```

Expected: 5 tests pass.

- [ ] **Step 4: Run the full api suite**

```bash
pnpm --filter @daynest/api test
```

Expected: previous **162** + 5 = **167** tests pass.

- [ ] **Step 5: Run the miniapp suite**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: **74 passing** (unchanged from Task 2 — these are api-side additions).

- [ ] **Step 6: Run all three builds**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/api build
pnpm --filter @daynest/shared build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/tests/wechat/miniapp-tags.test.ts apps/api/tsconfig.json
git commit -m "test(miniapp): end-to-end smoke test for tag pinboard + rename + merge"
```

---

## Post-plan verification (manual)

After all 10 commits, smoke-test in WeChat DevTools:

1. Refresh design tokens if you edited any:
   ```bash
   pnpm --filter @daynest/shared build
   pnpm --filter @daynest/miniapp tokens
   ```

2. Boot the api:
   ```bash
   pnpm --filter @daynest/api dev
   ```

3. Open WeChat DevTools → `apps/miniapp/` → 不校验合法域名.

4. Manual checks:
   - Tags tab → tap any popular tag → pinboard opens with the right list. Toggle scope between 全部 / 集合 / 照片.
   - Pinboard → tap 编辑 → rename page opens with the original name pre-filled.
   - Type a NEW name that is unique → 保存后将更名 hint → 保存 → toast 已更新 → navigates back to pinboard.
   - Type a name that matches an existing tag → 已存在 #X — 保存后两个标签将合并 hint (orange) → tap 保存 → modal 合并到已存在标签 → 合并 → toast 合并完成.
   - Timeline → tap a card → detail → tap a photo → viewer opens.
   - In viewer: pinch to zoom in; pan around. Try to swipe horizontally — swiper should be locked. Pinch out to zoom back to 1× — swiper unlocks.
   - Swipe to next photo — verify the zoom state resets cleanly.
   - Tap the heart in the corner — heart fills (sticker red); refresh and verify it stuck.
   - Tap the ⓘ in the corner — bottom drawer slides up with caption / taken-at / tags. Tap outside the drawer dismisses.
   - Long-press a photo — native `wx.previewImage` action sheet still works.

---

## Self-Review

**Spec coverage** (against `2026-05-22-miniapp-design.md`):
- §3.2 Tag pinboard + Tag rename — Tasks 4, 5 ✅
- §3.4 preloadRule for `pkgTags` — Task 3 ✅
- §4.10 Photo viewer pinch-zoom — Task 7 ✅
- §4.10 Photo viewer favorite + info — Tasks 8, 9 ✅
- All scope-toggle / merge-confirmation interactions on the rename page ✅

**Plan 03 boundary check:**
- Plan 03 left a `wx.showToast({ title: '标签详情即将上线' })` placeholder on the tags overview. Task 6 fills it.
- Plan 03's viewer at `pkgCollection/viewer/index.ts` was a baseline (swiper + counter + long-press). Tasks 7-9 layer pinch / favorite / info onto it via consecutive modifications to the same files.

**Placeholder scan:**
- No `TODO` / `later` / `implement appropriate error handling` in any task body.
- All commands have expected output (test counts, commit messages).
- All code blocks are complete (no `...`).

**Type consistency:**
- `CollectionSummaryDTO`, `PhotoDTO`, `TagDTO` imported only from `@daynest/shared` (no local redeclaration).
- `tagsService.rename` returns `TagRenameResponse extends TagDTO` (the existing `TagDTO` includes `photoCount?` / `collectionCount?` already).
- `normalizeTagName` mirrors `apps/api/src/services/tags.ts:5` byte-for-byte.

---

## Done criteria

After all 10 commits:
- `pnpm --filter @daynest/miniapp test` passes: **74** tests (5 new for tagName + 4 new for tags.rename + the prior 65)
- `pnpm --filter @daynest/api test` passes: **167** tests (5 new browse-smoke + the prior 162)
- `pnpm --filter @daynest/shared test` passes: **22** tests (unchanged)
- `pnpm --filter @daynest/miniapp build` clean
- `pnpm --filter @daynest/api build` clean (with `miniapp-tags.test.ts` in `exclude`)
- `apps/miniapp/miniprogram/pkgTags/` exists with `pinboard/` and `rename/` subdirectories
- Manual DevTools verification (Post-plan section) succeeds

—— end of plan
