# Mini-Program v1 — Plan 02 · Mini-App Foundation & Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the `apps/miniapp/` WeChat mini-program workspace, ship the runtime building blocks (lightweight store, typed `wx.storage` wrapper, `wx.request` client with 401 refresh, auth & theme stores), and deliver the three auth pages (`login` / `bind` / `register`) wired to the WeChat backend routes built in Plan 01.

**Architecture:** Native WeChat mini-program (no Taro, no Uni-app) with `tsc --watch` compiling TypeScript to JS that the WeChat DevTools runtime consumes. UI is hand-written WXML/WXSS. All shared types come from `@daynest/shared` via the existing workspace link. Tests are vitest-only — pure-TS logic runs against a `wx` mock harness in `tests/helpers/wxMock.ts`. WXML/WXSS rendering is verified manually in WeChat DevTools. Four empty tab placeholder pages + a custom tabBar shell are in place so the `wx.switchTab` calls after login land somewhere real; the actual feature pages are Plans 03/04/05.

**Tech Stack:** Native WeChat mini-program · TypeScript 5 · Vitest 1 · `miniprogram-api-typings` (WX globals) · `@daynest/shared` (workspace link) · pnpm workspaces. No runtime framework or UI library.

**Companion spec:** [`../specs/2026-05-22-miniapp-design.md`](../specs/2026-05-22-miniapp-design.md) (see §1, §2, §3, §4.1, §4.5 for the slice this plan covers)

**Backend dependency:** Plan 01 routes (`/api/auth/wechat-login`, `/api/auth/wechat-bind`, `/api/auth/wechat-register`, `/api/auth/refresh-token`) are already shipped on this branch.

**Scope of this plan:**
- ✅ `apps/miniapp/` workspace scaffold (package.json / tsconfig / app.json / project.config.json)
- ✅ Design tokens module in `packages/shared` + WXSS variable generator
- ✅ Reactive store primitive + tests
- ✅ Typed `wx.storage` wrapper + tests
- ✅ `wx.login` / `wx.checkSession` promise wrappers + tests
- ✅ API client (`wx.request` + 401 refresh + concurrency dedupe) + tests
- ✅ `authStore` & `themeStore` + tests
- ✅ `app.ts` boot routing (session restore → tab vs login)
- ✅ Custom tabBar shell (4 tabs, theme-reactive)
- ✅ Tab placeholder pages ("Coming Soon" stubs)
- ✅ `pages/login` / `pages/bind` / `pkgOnboarding/register`
- ✅ End-to-end auth smoke test (mocked `wx` against real test API)

**Out of scope (later plans):**
- ❌ Real tab page content (timeline, favorites, tags, me) — Plans 03 & 05
- ❌ Collection detail / photo viewer / double-pinch zoom — Plan 03
- ❌ Upload pipeline — Plan 04
- ❌ Subscribe-message UX prompts — Plan 05
- ❌ Font subsetting (`pyftsubset` pipeline) — Plan 06
- ❌ `miniprogram-ci` upload automation — Plan 06
- ❌ Audit / 体验版 / 隐私政策 page — Plan 06

---

## File Structure

### New files (in order they get created)

| Path | Purpose |
|---|---|
| `apps/miniapp/package.json` | Workspace package metadata, scripts, dev deps |
| `apps/miniapp/tsconfig.json` | TS config (target ES2018, lib DOM/ES2020, JSX off, paths to `@daynest/shared`) |
| `apps/miniapp/.gitignore` | Ignore `miniprogram/dist`, `project.private.config.json`, `ci-key/`, `node_modules` |
| `apps/miniapp/project.config.json` | WeChat DevTools project config (template) |
| `apps/miniapp/project.private.config.json.example` | Template with placeholder appid |
| `apps/miniapp/miniprogram/app.json` | App-level config (tabBar, subPackages, preload, permissions) |
| `apps/miniapp/miniprogram/app.ts` | App entry — onLaunch session restore + theme bootstrap |
| `apps/miniapp/miniprogram/app.wxss` | Global WXSS (resets + token CSS vars + light/dark) |
| `apps/miniapp/miniprogram/sitemap.json` | Default crawler config |
| `apps/miniapp/miniprogram/styles/tokens.wxss` | Auto-generated CSS variables (from design-tokens) |
| `apps/miniapp/miniprogram/lib/store.ts` | Lightweight reactive store factory |
| `apps/miniapp/miniprogram/lib/storage.ts` | Typed `wx.storage` wrapper |
| `apps/miniapp/miniprogram/lib/wxBridge.ts` | Promisified `wx.login`, `wx.checkSession`, `wx.showToast` |
| `apps/miniapp/miniprogram/lib/api.ts` | `wx.request` client (auth header + 401 refresh + dedupe) |
| `apps/miniapp/miniprogram/lib/endpoints.ts` | URL builder using `config.apiBase` |
| `apps/miniapp/miniprogram/lib/config.ts` | Runtime config (apiBase + flags) |
| `apps/miniapp/miniprogram/stores/authStore.ts` | Holds user + tokens, persists to wx.storage |
| `apps/miniapp/miniprogram/stores/themeStore.ts` | Holds light/dark/system preference |
| `apps/miniapp/miniprogram/custom-tab-bar/index.ts` | Custom tabBar logic |
| `apps/miniapp/miniprogram/custom-tab-bar/index.wxml` | Custom tabBar markup |
| `apps/miniapp/miniprogram/custom-tab-bar/index.wxss` | Custom tabBar styling |
| `apps/miniapp/miniprogram/custom-tab-bar/index.json` | Custom tabBar component manifest |
| `apps/miniapp/miniprogram/pages/timeline/index.{ts,wxml,wxss,json}` | "Coming Soon" placeholder |
| `apps/miniapp/miniprogram/pages/favorites/index.{ts,wxml,wxss,json}` | "Coming Soon" placeholder |
| `apps/miniapp/miniprogram/pages/tags/index.{ts,wxml,wxss,json}` | "Coming Soon" placeholder |
| `apps/miniapp/miniprogram/pages/me/index.{ts,wxml,wxss,json}` | "Coming Soon" placeholder + logout button |
| `apps/miniapp/miniprogram/pages/login/index.{ts,wxml,wxss,json}` | Welcome + 微信一键进入 |
| `apps/miniapp/miniprogram/pages/bind/index.{ts,wxml,wxss,json}` | Bind daynest username+password |
| `apps/miniapp/miniprogram/pkgOnboarding/register/index.{ts,wxml,wxss,json}` | Invite-token registration |
| `apps/miniapp/tests/helpers/wxMock.ts` | Programmatic `wx.*` mock for unit tests |
| `apps/miniapp/tests/lib/store.test.ts` | Store factory tests |
| `apps/miniapp/tests/lib/storage.test.ts` | Storage wrapper tests |
| `apps/miniapp/tests/lib/wxBridge.test.ts` | Bridge promise tests |
| `apps/miniapp/tests/lib/api.test.ts` | API client + 401 refresh + dedupe tests |
| `apps/miniapp/tests/stores/authStore.test.ts` | Auth store tests (persist / hydrate / logout) |
| `apps/miniapp/tests/stores/themeStore.test.ts` | Theme store tests (resolve / system / override) |
| `apps/miniapp/tests/smoke.test.ts` | End-to-end auth flow against real test API |
| `packages/shared/src/design-tokens.ts` | Color / shadow / font tokens (shared web ↔ miniapp) |
| `apps/miniapp/scripts/generate-tokens-wxss.mjs` | Emits `styles/tokens.wxss` from design-tokens |

### Modified files

| Path | Change |
|---|---|
| `pnpm-workspace.yaml` | (already includes `apps/*`, no change) |
| `packages/shared/src/index.ts` | `export * from './design-tokens.js';` |

### Files NOT touched (sanity check)
- `apps/api/**` — backend is frozen at the Plan 01 head
- `apps/web/**` — web app continues using its own token store

---

## Conventions

- **TDD per task** — failing test → run → minimal impl → run → commit. Each task is one commit.
- **Run tests** — `cd /Users/bytedance/work/ai/day_nest && pnpm --filter @daynest/miniapp test`
- **Typecheck** — `pnpm --filter @daynest/miniapp build` (tsc, emits to `miniprogram/dist` — DevTools doesn't use the dist; tsc is purely for type validation. Actual execution path is the **source** `.ts` compiled by the WeChat DevTools' built-in compiler plugin per `setting.useCompilerPlugins: ['typescript']` in `project.config.json`).
- **Commit format** — Conventional Commits (`feat(miniapp):`, `test(miniapp):`, `chore(miniapp):`).
- **Page file convention** — every page is 4 files in the same directory: `index.ts`, `index.wxml`, `index.wxss`, `index.json`.
- **WXSS units** — `rpx` for sizing (responsive), `px` for hairlines, never `rem`/`em`.
- **NO emoji in code or comments** — per repo-wide style rules. (Decorative SVGs are added later in Plan 03.)
- **`wx` access discipline** — never call `wx.xxx` from page/store code. Always go through `lib/wxBridge.ts` or `lib/storage.ts`. This is what makes unit tests possible.

---

## Task 1: Workspace scaffold

**Files:**
- Create: `apps/miniapp/package.json`
- Create: `apps/miniapp/tsconfig.json`
- Create: `apps/miniapp/.gitignore`
- Create: `apps/miniapp/project.config.json`
- Create: `apps/miniapp/project.private.config.json.example`
- Create: `apps/miniapp/miniprogram/sitemap.json`
- Create: `apps/miniapp/miniprogram/app.json` (minimal — populated in later tasks)
- Create: `apps/miniapp/miniprogram/app.ts` (minimal stub)
- Create: `apps/miniapp/miniprogram/app.wxss` (empty)
- Create: `apps/miniapp/typings/index.d.ts` (ambient — `wx` global comes from `miniprogram-api-typings`)

- [ ] **Step 1: Create `apps/miniapp/package.json`**

```json
{
  "name": "@daynest/miniapp",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p .",
    "build:watch": "tsc -p . --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "tokens": "node scripts/generate-tokens-wxss.mjs"
  },
  "dependencies": {
    "@daynest/shared": "workspace:*"
  },
  "devDependencies": {
    "miniprogram-api-typings": "^3.12.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/miniapp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2018",
    "module": "ES2020",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": false,
    "outDir": "miniprogram/dist",
    "rootDir": ".",
    "types": ["miniprogram-api-typings", "vitest/globals"],
    "paths": {
      "@daynest/shared": ["../../packages/shared/src/index.ts"]
    }
  },
  "include": [
    "miniprogram/**/*.ts",
    "tests/**/*.ts",
    "typings/**/*.d.ts"
  ],
  "exclude": ["miniprogram/dist", "node_modules"]
}
```

The `paths` entry lets tsc resolve `@daynest/shared` source directly (no build step needed); the WeChat DevTools compiler will still resolve via the workspace symlink + the package's `main`/`exports` (which is `dist/index.js`). Both paths must work, so `packages/shared` must be `pnpm build`'d before opening DevTools.

- [ ] **Step 3: Create `apps/miniapp/.gitignore`**

```
node_modules/
miniprogram/dist/
miniprogram/styles/tokens.wxss
project.private.config.json
ci-key/
*.log
```

`tokens.wxss` is generated, never committed. `project.private.config.json` carries the real `appid` and stays local.

- [ ] **Step 4: Create `apps/miniapp/project.config.json`**

```json
{
  "miniprogramRoot": "miniprogram/",
  "compileType": "miniprogram",
  "libVersion": "3.4.0",
  "appid": "touristappid",
  "projectname": "daynest-miniapp",
  "setting": {
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true,
    "newFeature": true,
    "useCompilerPlugins": ["typescript"],
    "uglifyFileName": true,
    "preloadBackgroundData": false,
    "showShadowRootInWxmlPanel": false,
    "useStaticServer": true
  },
  "scripts": {
    "beforeCompile": "",
    "beforePreview": "",
    "beforeUpload": ""
  }
}
```

`appid: "touristappid"` is the WeChat-reserved tourist appid that lets the project open in DevTools without a real registered AppID. The real appid lives in `project.private.config.json` (gitignored) and overrides this one at runtime.

- [ ] **Step 5: Create `apps/miniapp/project.private.config.json.example`**

```json
{
  "$schema": "https://developer.weixin.qq.com/miniprogram/dev/devtools/private.config.schema.json",
  "appid": "wxXXXXXXXXXXXXXXXX",
  "projectname": "daynest-miniapp",
  "setting": {
    "compileHotReLoad": true
  }
}
```

Document: `cp project.private.config.json.example project.private.config.json` and fill in the real appid.

- [ ] **Step 6: Create `apps/miniapp/miniprogram/app.json`**

```json
{
  "pages": [
    "pages/login/index",
    "pages/bind/index",
    "pages/timeline/index",
    "pages/favorites/index",
    "pages/tags/index",
    "pages/me/index"
  ],
  "subPackages": [
    {
      "root": "pkgOnboarding/",
      "name": "pkgOnboarding",
      "pages": ["register/index"]
    }
  ],
  "tabBar": {
    "custom": true,
    "color": "#6E5F4E",
    "selectedColor": "#2A2520",
    "backgroundColor": "#FBF4E4",
    "list": [
      { "pagePath": "pages/timeline/index", "text": "时间轴" },
      { "pagePath": "pages/favorites/index", "text": "收藏" },
      { "pagePath": "pages/tags/index", "text": "标签" },
      { "pagePath": "pages/me/index", "text": "我的" }
    ]
  },
  "window": {
    "navigationBarBackgroundColor": "#FBF4E4",
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "朝夕居",
    "backgroundColor": "#FBF4E4"
  },
  "permission": {
    "scope.userLocation": { "desc": "" }
  },
  "sitemapLocation": "sitemap.json",
  "lazyCodeLoading": "requiredComponents"
}
```

`custom: true` is the flag that tells WX to render our `custom-tab-bar/` component instead of the default. The `color`/`backgroundColor` fields are kept for fallback. tabBar list pages must each exist before WX will boot — that's why placeholders come in Task 11.

- [ ] **Step 7: Create `apps/miniapp/miniprogram/app.ts` (minimal stub)**

```typescript
App({
  onLaunch() {},
  onShow() {},
});
```

Real onLaunch logic comes in Task 9. This stub exists so DevTools can boot.

- [ ] **Step 8: Create `apps/miniapp/miniprogram/app.wxss`** (empty file)

A 0-byte `app.wxss` is mandatory; the real content arrives in Task 3.

- [ ] **Step 9: Create `apps/miniapp/miniprogram/sitemap.json`**

```json
{
  "desc": "关于本文件的更多信息，请参考文档 https://developers.weixin.qq.com/miniprogram/dev/framework/sitemap.html",
  "rules": [{ "action": "allow", "page": "*" }]
}
```

- [ ] **Step 10: Create `apps/miniapp/typings/index.d.ts`**

```typescript
/// <reference types="miniprogram-api-typings" />

declare module '*.json' {
  const value: unknown;
  export default value;
}
```

- [ ] **Step 11: Install dependencies**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm install
```

Expected: pnpm adds `miniprogram-api-typings` and `vitest` to `apps/miniapp/node_modules` and links `@daynest/shared`. No errors.

- [ ] **Step 12: Verify tsc and tests run (even with no tests yet)**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Expected: `build` exits 0, `test` exits 0 with "No test files found". If tsc complains about missing files, recheck Step 6/7 paths.

- [ ] **Step 13: Commit**

```bash
git add apps/miniapp/
git commit -m "chore(miniapp): scaffold workspace package + DevTools config"
```

---

## Task 2: Shared design tokens

**Files:**
- Create: `packages/shared/src/design-tokens.ts`
- Create: `packages/shared/src/design-tokens.test.ts`
- Modify: `packages/shared/src/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/design-tokens.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { tokens, type ThemeMode } from './design-tokens.js';

describe('design tokens', () => {
  it('exposes the expected paper, ink, and shadow groups', () => {
    expect(tokens.paper.cream).toBe('#FBF4E4');
    expect(tokens.paper.aged).toBe('#F3E6CB');
    expect(tokens.ink.primary).toBe('#2A2520');
    expect(tokens.ink.sticker).toBe('#D4523A');
    expect(tokens.shadow.polaroid).toContain('rgba');
  });

  it('provides dark-mode overrides for paper and ink', () => {
    expect(tokens.dark.paper.cream).not.toBe(tokens.paper.cream);
    expect(tokens.dark.ink.primary).not.toBe(tokens.ink.primary);
  });

  it('ThemeMode type accepts the three documented values', () => {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    expect(modes).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test — must fail (module not found)**

```bash
pnpm --filter @daynest/shared test
```

Expected: `Cannot find module './design-tokens.js'`.

- [ ] **Step 3: Create `packages/shared/src/design-tokens.ts`**

```typescript
export type ThemeMode = 'light' | 'dark' | 'system';

export const tokens = {
  paper: {
    cream: '#FBF4E4',
    aged: '#F3E6CB',
    sepia: '#A88B5C',
  },
  ink: {
    primary: '#2A2520',
    secondary: '#6E5F4E',
    sticker: '#D4523A',
  },
  shadow: {
    polaroid: '0 2px 4px rgba(0,0,0,.08), 0 8px 20px rgba(0,0,0,.12)',
    sticker: '0 1px 2px rgba(0,0,0,.15)',
  },
  dark: {
    paper: {
      cream: '#1C1A17',
      aged: '#2A2520',
      sepia: '#6E5F4E',
    },
    ink: {
      primary: '#F3E6CB',
      secondary: '#A88B5C',
      sticker: '#E07A60',
    },
  },
} as const;

export type Tokens = typeof tokens;
```

- [ ] **Step 4: Update `packages/shared/src/index.ts`**

Add the new export at the bottom:

```typescript
export * from './auth.js';
export * from './collection.js';
export * from './photo.js';
export * from './tag.js';
export * from './wechat.js';
export * from './design-tokens.js';
```

- [ ] **Step 5: Run tests — must pass**

```bash
pnpm --filter @daynest/shared test
```

Expected: 3 tests pass (plus the existing ones).

- [ ] **Step 6: Build shared so the workspace consumer (miniapp) can resolve it**

```bash
pnpm --filter @daynest/shared build
```

Expected: emits `packages/shared/dist/design-tokens.js`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/design-tokens.ts packages/shared/src/design-tokens.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add design-tokens module shared by web & miniapp"
```

---

## Task 3: WXSS variable generator + `app.wxss`

**Files:**
- Create: `apps/miniapp/scripts/generate-tokens-wxss.mjs`
- Modify: `apps/miniapp/miniprogram/app.wxss` (replace empty stub)
- Generated: `apps/miniapp/miniprogram/styles/tokens.wxss` (gitignored, regenerated)

- [ ] **Step 1: Create `apps/miniapp/scripts/generate-tokens-wxss.mjs`**

```javascript
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../../../packages/shared/dist/design-tokens.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'miniprogram', 'styles', 'tokens.wxss');

function flat(prefix, obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      lines.push(`  --${prefix}${k}: ${v};`);
    } else {
      lines.push(...flat(`${prefix}${k}-`, v));
    }
  }
  return lines;
}

const light = flat('', { paper: tokens.paper, ink: tokens.ink, shadow: tokens.shadow });
const dark = flat('', { paper: tokens.dark.paper, ink: tokens.dark.ink, shadow: tokens.shadow });

const out = [
  '/* AUTO-GENERATED by scripts/generate-tokens-wxss.mjs. Do not edit. */',
  'page {',
  ...light,
  '}',
  '.dark, page.dark {',
  ...dark,
  '}',
  '',
].join('\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');
console.log(`wrote ${OUT} (${out.length} bytes)`);
```

- [ ] **Step 2: Run the generator**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm --filter @daynest/miniapp tokens
```

Expected: prints `wrote .../tokens.wxss (NNN bytes)`. Verify the file exists and contains `--paper-cream: #FBF4E4;` plus a `.dark` block.

- [ ] **Step 3: Write the real `apps/miniapp/miniprogram/app.wxss`**

```css
@import 'styles/tokens.wxss';

/* Reset */
page {
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--paper-cream);
  color: var(--ink-primary);
  font-size: 28rpx;
  line-height: 1.5;
}

view, text, input, button, image {
  box-sizing: border-box;
}

button {
  background: transparent;
  border: none;
  padding: 0;
  line-height: normal;
}
button::after { border: none; }
```

- [ ] **Step 4: Verify tsc still clean**

```bash
pnpm --filter @daynest/miniapp build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/scripts/generate-tokens-wxss.mjs apps/miniapp/miniprogram/app.wxss
git commit -m "feat(miniapp): generate tokens.wxss + base app.wxss with light/dark variables"
```

(Note: `tokens.wxss` itself is gitignored. Regeneration on fresh clone happens via `pnpm --filter @daynest/miniapp tokens`.)

---

## Task 4: Reactive store primitive

**Files:**
- Create: `apps/miniapp/miniprogram/lib/store.ts`
- Create: `apps/miniapp/tests/lib/store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/miniapp/tests/lib/store.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../miniprogram/lib/store.js';

describe('createStore', () => {
  it('exposes initial state via getState()', () => {
    const store = createStore({ count: 0 });
    expect(store.getState()).toEqual({ count: 0 });
  });

  it('setState applies a partial update and notifies subscribers', () => {
    const store = createStore({ count: 0, name: 'a' });
    const sub = vi.fn();
    store.subscribe(sub);
    store.setState({ count: 1 });
    expect(store.getState()).toEqual({ count: 1, name: 'a' });
    expect(sub).toHaveBeenCalledTimes(1);
    expect(sub).toHaveBeenCalledWith({ count: 1, name: 'a' });
  });

  it('does NOT notify subscribers when nothing actually changes', () => {
    const store = createStore({ count: 0 });
    const sub = vi.fn();
    store.subscribe(sub);
    store.setState({ count: 0 });
    expect(sub).not.toHaveBeenCalled();
  });

  it('subscribe returns an unsubscribe function that stops notifications', () => {
    const store = createStore({ count: 0 });
    const sub = vi.fn();
    const unsub = store.subscribe(sub);
    store.setState({ count: 1 });
    unsub();
    store.setState({ count: 2 });
    expect(sub).toHaveBeenCalledTimes(1);
  });

  it('a subscriber thrown error does not break other subscribers', () => {
    const store = createStore({ count: 0 });
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    store.subscribe(bad);
    store.subscribe(good);
    expect(() => store.setState({ count: 1 })).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
  });

  it('setState accepts an updater function', () => {
    const store = createStore({ count: 5 });
    store.setState((s) => ({ count: s.count + 1 }));
    expect(store.getState().count).toBe(6);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: `Cannot find module '../../miniprogram/lib/store.js'`.

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/store.ts`**

```typescript
export type Subscriber<S> = (state: S) => void;

export interface Store<S> {
  getState(): S;
  setState(patch: Partial<S> | ((state: S) => Partial<S>)): void;
  subscribe(sub: Subscriber<S>): () => void;
}

function shallowEqual<S>(a: S, b: S): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const subs = new Set<Subscriber<S>>();
  return {
    getState: () => state,
    setState(patch) {
      const partial = typeof patch === 'function' ? patch(state) : patch;
      const next = { ...state, ...partial };
      if (shallowEqual(state, next)) return;
      state = next;
      for (const sub of subs) {
        try {
          sub(state);
        } catch (e) {
          console.error('[store] subscriber threw:', e);
        }
      }
    },
    subscribe(sub) {
      subs.add(sub);
      return () => subs.delete(sub);
    },
  };
}
```

- [ ] **Step 4: Run — must pass**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/store.ts apps/miniapp/tests/lib/store.test.ts
git commit -m "feat(miniapp): lightweight reactive store factory + tests"
```

---

## Task 5: `wx` mock harness + typed storage wrapper

**Files:**
- Create: `apps/miniapp/tests/helpers/wxMock.ts`
- Create: `apps/miniapp/miniprogram/lib/storage.ts`
- Create: `apps/miniapp/tests/lib/storage.test.ts`

- [ ] **Step 1: Create the `wx` mock harness**

Create `apps/miniapp/tests/helpers/wxMock.ts`:

```typescript
export interface WxMockOptions {
  storage?: Record<string, unknown>;
  systemTheme?: 'light' | 'dark';
}

export interface WxMock {
  storage: Map<string, unknown>;
  requests: Array<{ url: string; method?: string; data?: unknown; header?: Record<string, string> }>;
  /** Configure the next wx.request response. Pop from the front per call. */
  queueResponse(res: { statusCode: number; data: unknown }): void;
  /** Configure the next wx.login response. */
  queueLogin(res: { code: string }): void;
  /** Capture wx.navigateTo / wx.reLaunch / wx.switchTab calls. */
  navStack: Array<{ kind: 'navigateTo' | 'reLaunch' | 'switchTab'; url: string }>;
}

export function installWxMock(opts: WxMockOptions = {}): WxMock {
  const storage = new Map<string, unknown>(Object.entries(opts.storage ?? {}));
  const requests: WxMock['requests'] = [];
  const requestQueue: Array<{ statusCode: number; data: unknown }> = [];
  const loginQueue: Array<{ code: string }> = [];
  const navStack: WxMock['navStack'] = [];

  const wx = {
    getStorageSync: (k: string) => storage.get(k) ?? '',
    setStorageSync: (k: string, v: unknown) => { storage.set(k, v); },
    removeStorageSync: (k: string) => { storage.delete(k); },
    clearStorageSync: () => { storage.clear(); },

    getSystemInfoSync: () => ({ theme: opts.systemTheme ?? 'light' }),
    onThemeChange: () => undefined,

    login: (o: { success?: (r: { code: string }) => void; fail?: (e: unknown) => void }) => {
      const next = loginQueue.shift();
      if (!next) {
        o.fail?.(new Error('no queued login response'));
        return;
      }
      Promise.resolve().then(() => o.success?.(next));
    },
    checkSession: (o: { success?: () => void; fail?: () => void }) => {
      Promise.resolve().then(() => o.success?.());
    },
    request: (o: {
      url: string;
      method?: string;
      data?: unknown;
      header?: Record<string, string>;
      success?: (r: { statusCode: number; data: unknown }) => void;
      fail?: (e: unknown) => void;
    }) => {
      requests.push({ url: o.url, method: o.method, data: o.data, header: o.header });
      const next = requestQueue.shift();
      if (!next) {
        o.fail?.(new Error('no queued response for ' + o.url));
        return { abort: () => undefined };
      }
      Promise.resolve().then(() => o.success?.(next));
      return { abort: () => undefined };
    },

    navigateTo: (o: { url: string }) => { navStack.push({ kind: 'navigateTo', url: o.url }); },
    reLaunch: (o: { url: string }) => { navStack.push({ kind: 'reLaunch', url: o.url }); },
    switchTab: (o: { url: string }) => { navStack.push({ kind: 'switchTab', url: o.url }); },

    showToast: () => undefined,
    showLoading: () => undefined,
    hideLoading: () => undefined,
    getNetworkType: (o: { success?: (r: { networkType: string }) => void }) => {
      Promise.resolve().then(() => o.success?.({ networkType: 'wifi' }));
    },
  };

  (globalThis as Record<string, unknown>).wx = wx;

  return {
    storage,
    requests,
    queueResponse: (r) => { requestQueue.push(r); },
    queueLogin: (r) => { loginQueue.push(r); },
    navStack,
  };
}

export function uninstallWxMock(): void {
  delete (globalThis as Record<string, unknown>).wx;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/miniapp/tests/lib/storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { storage } from '../../miniprogram/lib/storage.js';

describe('storage wrapper', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('get returns null when the key is missing', () => {
    expect(storage.get<string>('missing')).toBeNull();
  });

  it('set writes through and get reads back the same value', () => {
    storage.set('user', { id: 'u1', name: 'A' });
    expect(storage.get('user')).toEqual({ id: 'u1', name: 'A' });
  });

  it('remove deletes the key', () => {
    storage.set('x', 1);
    storage.remove('x');
    expect(storage.get('x')).toBeNull();
    expect(mock.storage.has('x')).toBe(false);
  });

  it('preserves type information across set/get for objects', () => {
    type T = { a: number; b: string };
    storage.set<T>('obj', { a: 1, b: 'two' });
    const out = storage.get<T>('obj');
    expect(out?.a).toBe(1);
    expect(out?.b).toBe('two');
  });

  it('treats the empty-string wx default as null', () => {
    mock.storage.set('weird', '');
    expect(storage.get('weird')).toBeNull();
  });
});
```

- [ ] **Step 3: Run — must fail**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: `Cannot find module '../../miniprogram/lib/storage.js'`.

- [ ] **Step 4: Create `apps/miniapp/miniprogram/lib/storage.ts`**

```typescript
export const storage = {
  get<T>(key: string): T | null {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) return null;
    return v as T;
  },
  set<T>(key: string, value: T): void {
    wx.setStorageSync(key, value);
  },
  remove(key: string): void {
    wx.removeStorageSync(key);
  },
  clear(): void {
    wx.clearStorageSync();
  },
};
```

- [ ] **Step 5: Run — must pass**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: 5 storage tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/tests/helpers/wxMock.ts apps/miniapp/miniprogram/lib/storage.ts apps/miniapp/tests/lib/storage.test.ts
git commit -m "feat(miniapp): wx mock harness + typed storage wrapper"
```

---

## Task 6: `wx.login` / `wx.checkSession` bridge

**Files:**
- Create: `apps/miniapp/miniprogram/lib/wxBridge.ts`
- Create: `apps/miniapp/tests/lib/wxBridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/miniapp/tests/lib/wxBridge.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { wxLogin, wxCheckSession } from '../../miniprogram/lib/wxBridge.js';

describe('wxBridge', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('wxLogin resolves with the queued code', async () => {
    mock.queueLogin({ code: 'wx-code-xyz' });
    const code = await wxLogin();
    expect(code).toBe('wx-code-xyz');
  });

  it('wxLogin rejects when the queue is empty', async () => {
    await expect(wxLogin()).rejects.toThrow(/no queued/);
  });

  it('wxCheckSession resolves true when wx says ok', async () => {
    await expect(wxCheckSession()).resolves.toBe(true);
  });

  it('wxCheckSession resolves false when wx fail-callback fires', async () => {
    (globalThis as Record<string, unknown>).wx = {
      checkSession: (o: { fail?: () => void }) => Promise.resolve().then(() => o.fail?.()),
    };
    await expect(wxCheckSession()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
pnpm --filter @daynest/miniapp test
```

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/wxBridge.ts`**

```typescript
export function wxLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (r) => resolve(r.code),
      fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    });
  });
}

export function wxCheckSession(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.checkSession({
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

export function wxShowToast(title: string, icon: 'success' | 'error' | 'none' = 'none'): void {
  wx.showToast({ title, icon, duration: 1800 });
}
```

- [ ] **Step 4: Run — must pass**

Expected: 4 bridge tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/wxBridge.ts apps/miniapp/tests/lib/wxBridge.test.ts
git commit -m "feat(miniapp): wxLogin / wxCheckSession / wxShowToast bridge helpers"
```

---

## Task 7: Runtime config + endpoints

**Files:**
- Create: `apps/miniapp/miniprogram/lib/config.ts`
- Create: `apps/miniapp/miniprogram/lib/endpoints.ts`

(No tests for this task — pure constants.)

- [ ] **Step 1: Create `apps/miniapp/miniprogram/lib/config.ts`**

```typescript
/**
 * Runtime config for the mini-program.
 *
 * `apiBase` MUST be configured in the WeChat 公众平台 "request 合法域名" list
 * before release. For local DevTools development, set "不校验合法域名" in
 * the project settings and point apiBase at http://localhost:3000.
 */
export const config = {
  apiBase: 'https://daynest.top',
  /** Local development override — only effective in WeChat DevTools. */
  apiBaseDev: 'http://localhost:3000',
} as const;

export function resolveApiBase(): string {
  try {
    const env = wx.getAccountInfoSync?.()?.miniProgram?.envVersion;
    if (env === 'develop' || env === 'trial') return config.apiBaseDev;
  } catch {
    // older WeChat clients without getAccountInfoSync — fall through
  }
  return config.apiBase;
}
```

- [ ] **Step 2: Create `apps/miniapp/miniprogram/lib/endpoints.ts`**

```typescript
import { resolveApiBase } from './config.js';

export const endpoints = {
  wechatLogin: () => `${resolveApiBase()}/api/auth/wechat-login`,
  wechatBind: () => `${resolveApiBase()}/api/auth/wechat-bind`,
  wechatRegister: () => `${resolveApiBase()}/api/auth/wechat-register`,
  wechatUnbind: () => `${resolveApiBase()}/api/auth/wechat-unbind`,
  refreshToken: () => `${resolveApiBase()}/api/auth/refresh-token`,
  me: () => `${resolveApiBase()}/api/auth/me`,
  subscribe: () => `${resolveApiBase()}/api/wechat/subscribe`,
};
```

- [ ] **Step 3: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/lib/config.ts apps/miniapp/miniprogram/lib/endpoints.ts
git commit -m "feat(miniapp): runtime config + endpoints registry"
```

---

## Task 8: API client (`wx.request` + 401 refresh + dedupe)

**Files:**
- Create: `apps/miniapp/miniprogram/lib/api.ts`
- Create: `apps/miniapp/tests/lib/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/miniapp/tests/lib/api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { createApiClient, type TokenProvider } from '../../miniprogram/lib/api.js';

function tokens(initial = { access: 'a1', refresh: 'r1' }): TokenProvider {
  let access = initial.access;
  let refresh = initial.refresh;
  let cleared = false;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: (a, r) => { access = a; refresh = r; },
    clearTokens: () => { cleared = true; access = ''; refresh = ''; },
    isCleared: () => cleared,
  } as TokenProvider & { isCleared: () => boolean };
}

describe('api client', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('attaches Authorization Bearer header from TokenProvider', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(mock.requests[0]?.header?.Authorization).toBe('Bearer a1');
  });

  it('omits Authorization header when no access token', async () => {
    const tp = tokens({ access: '', refresh: '' });
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(mock.requests[0]?.header?.Authorization).toBeUndefined();
  });

  it('on 401, refreshes once and retries the original request', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: { error: 'expired' } });
    mock.queueResponse({ statusCode: 200, data: { accessToken: 'a2', refreshToken: 'r2' } });
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    const res = await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(res.statusCode).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(mock.requests.length).toBe(3);
    expect(mock.requests[1]?.url).toBe('https://x/refresh');
    expect(mock.requests[2]?.header?.Authorization).toBe('Bearer a2');
    expect(tp.getAccessToken()).toBe('a2');
  });

  it('on refresh failure, clears tokens and surfaces 401', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: { error: 'expired' } });
    mock.queueResponse({ statusCode: 401, data: { error: 'BAD_REFRESH' } });
    const res = await api.request({ url: 'https://x/foo', method: 'GET' });
    expect(res.statusCode).toBe(401);
    expect((tp as unknown as { isCleared: () => boolean }).isCleared()).toBe(true);
  });

  it('coalesces concurrent 401s into a single refresh', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: {} });
    mock.queueResponse({ statusCode: 401, data: {} });
    mock.queueResponse({ statusCode: 200, data: { accessToken: 'a2', refreshToken: 'r2' } });
    mock.queueResponse({ statusCode: 200, data: { which: 'first' } });
    mock.queueResponse({ statusCode: 200, data: { which: 'second' } });
    const [r1, r2] = await Promise.all([
      api.request({ url: 'https://x/foo', method: 'GET' }),
      api.request({ url: 'https://x/bar', method: 'GET' }),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const refreshes = mock.requests.filter((r) => r.url === 'https://x/refresh');
    expect(refreshes.length).toBe(1);
  });

  it('does NOT retry the refresh URL itself on 401', async () => {
    const tp = tokens();
    const api = createApiClient({ tokens: tp, refreshUrl: 'https://x/refresh' });
    mock.queueResponse({ statusCode: 401, data: { error: 'BAD_REFRESH' } });
    const res = await api.request({ url: 'https://x/refresh', method: 'POST', data: {} });
    expect(res.statusCode).toBe(401);
    expect(mock.requests.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/api.ts`**

```typescript
export interface TokenProvider {
  getAccessToken(): string;
  getRefreshToken(): string;
  setTokens(access: string, refresh: string): void;
  clearTokens(): void;
}

export interface ApiRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  data?: unknown;
  header?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  statusCode: number;
  data: T;
}

export interface ApiClient {
  request<T = unknown>(req: ApiRequest): Promise<ApiResponse<T>>;
}

export interface ApiClientOptions {
  tokens: TokenProvider;
  refreshUrl: string;
}

function wxRequest<T>(req: ApiRequest): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: req.url,
      method: req.method ?? 'GET',
      data: req.data,
      header: req.header,
      success: (r) => resolve({ statusCode: r.statusCode, data: r.data as T }),
      fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    });
  });
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  let inflightRefresh: Promise<boolean> | null = null;

  async function refreshOnce(): Promise<boolean> {
    if (inflightRefresh) return inflightRefresh;
    const refresh = opts.tokens.getRefreshToken();
    if (!refresh) {
      opts.tokens.clearTokens();
      return false;
    }
    inflightRefresh = (async () => {
      try {
        const res = await wxRequest<{ accessToken?: string; refreshToken?: string }>({
          url: opts.refreshUrl,
          method: 'POST',
          data: { refreshToken: refresh },
          header: { 'content-type': 'application/json' },
        });
        if (res.statusCode === 200 && res.data.accessToken && res.data.refreshToken) {
          opts.tokens.setTokens(res.data.accessToken, res.data.refreshToken);
          return true;
        }
        opts.tokens.clearTokens();
        return false;
      } finally {
        inflightRefresh = null;
      }
    })();
    return inflightRefresh;
  }

  async function send<T>(req: ApiRequest, allowRetry: boolean): Promise<ApiResponse<T>> {
    const header: Record<string, string> = { ...(req.header ?? {}) };
    if (req.data !== undefined && header['content-type'] === undefined) {
      header['content-type'] = 'application/json';
    }
    const access = opts.tokens.getAccessToken();
    if (access) header.Authorization = `Bearer ${access}`;
    const res = await wxRequest<T>({ ...req, header });
    if (res.statusCode === 401 && allowRetry && req.url !== opts.refreshUrl) {
      const ok = await refreshOnce();
      if (ok) return send<T>(req, false);
    }
    return res;
  }

  return {
    request<T>(req: ApiRequest) {
      return send<T>(req, true);
    },
  };
}
```

- [ ] **Step 4: Run — must pass**

Expected: 6 api tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/api.ts apps/miniapp/tests/lib/api.test.ts
git commit -m "feat(miniapp): api client with 401 refresh + concurrency dedupe"
```

---

## Task 9: `authStore` (persistence + hydrate)

**Files:**
- Create: `apps/miniapp/miniprogram/stores/authStore.ts`
- Create: `apps/miniapp/tests/stores/authStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/miniapp/tests/stores/authStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { authStore, AUTH_STORAGE_KEYS } from '../../miniprogram/stores/authStore.js';

describe('authStore', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
  });
  afterEach(() => uninstallWxMock());

  it('initial state is signed out', () => {
    expect(authStore.getState()).toEqual({
      user: null,
      accessToken: '',
      refreshToken: '',
      hydrated: false,
    });
  });

  it('hydrate() reads tokens + user from storage', () => {
    mock.storage.set(AUTH_STORAGE_KEYS.access, 'a1');
    mock.storage.set(AUTH_STORAGE_KEYS.refresh, 'r1');
    mock.storage.set(AUTH_STORAGE_KEYS.user, {
      id: 'u1', username: 'mom', displayName: '妈妈', avatarKey: null, hasWechatBound: true,
    });
    authStore.hydrate();
    expect(authStore.getState().hydrated).toBe(true);
    expect(authStore.getState().accessToken).toBe('a1');
    expect(authStore.getState().user?.username).toBe('mom');
  });

  it('setSession persists tokens and user to storage', () => {
    authStore.setSession({
      user: { id: 'u2', username: 'dad', displayName: '爸爸', avatarKey: null, hasWechatBound: true },
      accessToken: 'a2',
      refreshToken: 'r2',
    });
    expect(mock.storage.get(AUTH_STORAGE_KEYS.access)).toBe('a2');
    expect(mock.storage.get(AUTH_STORAGE_KEYS.refresh)).toBe('r2');
    expect((mock.storage.get(AUTH_STORAGE_KEYS.user) as { username: string }).username).toBe('dad');
  });

  it('logout clears state and storage', () => {
    authStore.setSession({
      user: { id: 'u3', username: 'x', displayName: 'X', avatarKey: null, hasWechatBound: true },
      accessToken: 'a3',
      refreshToken: 'r3',
    });
    authStore.logout();
    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().accessToken).toBe('');
    expect(mock.storage.has(AUTH_STORAGE_KEYS.access)).toBe(false);
    expect(mock.storage.has(AUTH_STORAGE_KEYS.user)).toBe(false);
  });

  it('exposes TokenProvider compatible methods', () => {
    authStore.setSession({
      user: { id: 'u', username: 'u', displayName: 'U', avatarKey: null, hasWechatBound: false },
      accessToken: 'a4',
      refreshToken: 'r4',
    });
    expect(authStore.getAccessToken()).toBe('a4');
    expect(authStore.getRefreshToken()).toBe('r4');
    authStore.setTokens('a5', 'r5');
    expect(authStore.getAccessToken()).toBe('a5');
    authStore.clearTokens();
    expect(authStore.getAccessToken()).toBe('');
    expect(authStore.getState().user).toBeNull();
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/stores/authStore.ts`**

```typescript
import type { UserDTO } from '@daynest/shared';
import { createStore } from '../lib/store.js';
import { storage } from '../lib/storage.js';
import type { TokenProvider } from '../lib/api.js';

export const AUTH_STORAGE_KEYS = {
  access: 'daynest.auth.access',
  refresh: 'daynest.auth.refresh',
  user: 'daynest.auth.user',
} as const;

interface AuthState {
  user: UserDTO | null;
  accessToken: string;
  refreshToken: string;
  hydrated: boolean;
}

const store = createStore<AuthState>({
  user: null,
  accessToken: '',
  refreshToken: '',
  hydrated: false,
});

interface SetSessionInput {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

function persist(state: { user: UserDTO | null; accessToken: string; refreshToken: string }) {
  if (state.accessToken) storage.set(AUTH_STORAGE_KEYS.access, state.accessToken);
  else storage.remove(AUTH_STORAGE_KEYS.access);
  if (state.refreshToken) storage.set(AUTH_STORAGE_KEYS.refresh, state.refreshToken);
  else storage.remove(AUTH_STORAGE_KEYS.refresh);
  if (state.user) storage.set(AUTH_STORAGE_KEYS.user, state.user);
  else storage.remove(AUTH_STORAGE_KEYS.user);
}

export const authStore = {
  getState: store.getState,
  subscribe: store.subscribe,

  hydrate(): void {
    const accessToken = storage.get<string>(AUTH_STORAGE_KEYS.access) ?? '';
    const refreshToken = storage.get<string>(AUTH_STORAGE_KEYS.refresh) ?? '';
    const user = storage.get<UserDTO>(AUTH_STORAGE_KEYS.user);
    store.setState({ accessToken, refreshToken, user, hydrated: true });
  },

  setSession(input: SetSessionInput): void {
    persist(input);
    store.setState({
      user: input.user,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      hydrated: true,
    });
  },

  setUser(user: UserDTO): void {
    persist({ user, accessToken: store.getState().accessToken, refreshToken: store.getState().refreshToken });
    store.setState({ user });
  },

  logout(): void {
    persist({ user: null, accessToken: '', refreshToken: '' });
    store.setState({ user: null, accessToken: '', refreshToken: '', hydrated: true });
  },

  // TokenProvider methods (consumed by api.ts)
  getAccessToken: () => store.getState().accessToken,
  getRefreshToken: () => store.getState().refreshToken,
  setTokens(access: string, refresh: string): void {
    persist({ user: store.getState().user, accessToken: access, refreshToken: refresh });
    store.setState({ accessToken: access, refreshToken: refresh });
  },
  clearTokens(): void {
    persist({ user: null, accessToken: '', refreshToken: '' });
    store.setState({ user: null, accessToken: '', refreshToken: '' });
  },

  /** Test-only: forcibly reset to initial. */
  reset(): void {
    store.setState({ user: null, accessToken: '', refreshToken: '', hydrated: false });
  },
} satisfies TokenProvider & Record<string, unknown>;
```

- [ ] **Step 4: Run — must pass**

Expected: 5 authStore tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/stores/authStore.ts apps/miniapp/tests/stores/authStore.test.ts
git commit -m "feat(miniapp): authStore with wx.storage persistence + TokenProvider methods"
```

---

## Task 10: `themeStore`

**Files:**
- Create: `apps/miniapp/miniprogram/stores/themeStore.ts`
- Create: `apps/miniapp/tests/stores/themeStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/miniapp/tests/stores/themeStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { themeStore, THEME_STORAGE_KEY } from '../../miniprogram/stores/themeStore.js';

describe('themeStore', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock({ systemTheme: 'light' });
    themeStore.reset();
  });
  afterEach(() => uninstallWxMock());

  it('defaults to system mode + light resolved', () => {
    themeStore.hydrate();
    expect(themeStore.getState().mode).toBe('system');
    expect(themeStore.getState().resolved).toBe('light');
  });

  it('resolved follows system theme when mode is system', () => {
    uninstallWxMock();
    mock = installWxMock({ systemTheme: 'dark' });
    themeStore.hydrate();
    expect(themeStore.getState().resolved).toBe('dark');
  });

  it('explicit light/dark overrides system theme', () => {
    mock = installWxMock({ systemTheme: 'dark' });
    themeStore.setMode('light');
    expect(themeStore.getState().resolved).toBe('light');
    themeStore.setMode('dark');
    expect(themeStore.getState().resolved).toBe('dark');
  });

  it('mode is persisted to storage', () => {
    themeStore.setMode('dark');
    expect(mock.storage.get(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('hydrate reads persisted mode', () => {
    mock.storage.set(THEME_STORAGE_KEY, 'dark');
    themeStore.hydrate();
    expect(themeStore.getState().mode).toBe('dark');
    expect(themeStore.getState().resolved).toBe('dark');
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/stores/themeStore.ts`**

```typescript
import type { ThemeMode } from '@daynest/shared';
import { createStore } from '../lib/store.js';
import { storage } from '../lib/storage.js';

export const THEME_STORAGE_KEY = 'daynest.theme.mode';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
}

const store = createStore<ThemeState>({ mode: 'system', resolved: 'light' });

function readSystem(): 'light' | 'dark' {
  try {
    const sys = wx.getSystemInfoSync();
    return sys.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return readSystem();
}

export const themeStore = {
  getState: store.getState,
  subscribe: store.subscribe,

  hydrate(): void {
    const persisted = storage.get<ThemeMode>(THEME_STORAGE_KEY) ?? 'system';
    store.setState({ mode: persisted, resolved: resolve(persisted) });
  },

  setMode(mode: ThemeMode): void {
    storage.set(THEME_STORAGE_KEY, mode);
    store.setState({ mode, resolved: resolve(mode) });
  },

  /** Re-resolve when the system theme changes (only meaningful when mode==='system'). */
  refresh(): void {
    store.setState({ resolved: resolve(store.getState().mode) });
  },

  /** Test-only reset. */
  reset(): void {
    store.setState({ mode: 'system', resolved: 'light' });
  },
};
```

- [ ] **Step 4: Run — must pass**

Expected: 5 theme tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/stores/themeStore.ts apps/miniapp/tests/stores/themeStore.test.ts
git commit -m "feat(miniapp): themeStore (light/dark/system) with persistence"
```

---

## Task 11: Tab placeholder pages + custom tabBar

**Files:**
- Create: `apps/miniapp/miniprogram/pages/timeline/index.{ts,wxml,wxss,json}`
- Create: `apps/miniapp/miniprogram/pages/favorites/index.{ts,wxml,wxss,json}`
- Create: `apps/miniapp/miniprogram/pages/tags/index.{ts,wxml,wxss,json}`
- Create: `apps/miniapp/miniprogram/pages/me/index.{ts,wxml,wxss,json}`
- Create: `apps/miniapp/miniprogram/custom-tab-bar/index.{ts,wxml,wxss,json}`

- [ ] **Step 1: Create the 4 placeholder pages**

For each of `timeline`, `favorites`, `tags`, `me`, create the 4 files. Use the exact tab title in the placeholder copy.

`apps/miniapp/miniprogram/pages/timeline/index.json`:
```json
{ "navigationBarTitleText": "时间轴", "usingComponents": {} }
```

`apps/miniapp/miniprogram/pages/timeline/index.ts`:
```typescript
Page({
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0 });
    }
  },
});
```

`apps/miniapp/miniprogram/pages/timeline/index.wxml`:
```html
<view class="page">
  <view class="card">
    <view class="title">时间轴</view>
    <view class="hint">即将上线 · v1 主线</view>
  </view>
</view>
```

`apps/miniapp/miniprogram/pages/timeline/index.wxss`:
```css
.page {
  min-height: 100vh;
  padding: 120rpx 48rpx;
  background: var(--paper-cream);
}
.card {
  background: #FFFCF5;
  padding: 64rpx 32rpx;
  border-radius: 8rpx;
  box-shadow: var(--shadow-polaroid);
  text-align: center;
}
.title { font-size: 44rpx; color: var(--ink-primary); margin-bottom: 16rpx; }
.hint { font-size: 26rpx; color: var(--ink-secondary); }
```

Repeat for `favorites` (title "收藏", `active: 1`), `tags` (title "标签", `active: 2`), `me` (title "我的", `active: 3`).

For `me`, also include a logout button. `apps/miniapp/miniprogram/pages/me/index.wxml`:
```html
<view class="page">
  <view class="card">
    <view class="title">我的</view>
    <view class="hint">个人信息与设置 · 即将上线</view>
    <button class="logout" bindtap="onLogout">退出登录</button>
  </view>
</view>
```

`apps/miniapp/miniprogram/pages/me/index.ts`:
```typescript
import { authStore } from '../../stores/authStore.js';

Page({
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 });
    }
  },
  onLogout() {
    authStore.logout();
    wx.reLaunch({ url: '/pages/login/index' });
  },
});
```

`apps/miniapp/miniprogram/pages/me/index.wxss` — append:
```css
.logout {
  margin-top: 64rpx;
  background: var(--ink-sticker);
  color: #fff;
  padding: 20rpx 64rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
}
```

- [ ] **Step 2: Create the custom tabBar**

`apps/miniapp/miniprogram/custom-tab-bar/index.json`:
```json
{ "component": true, "usingComponents": {} }
```

`apps/miniapp/miniprogram/custom-tab-bar/index.ts`:
```typescript
Component({
  data: {
    active: 0,
    list: [
      { pagePath: '/pages/timeline/index', text: '时间轴' },
      { pagePath: '/pages/favorites/index', text: '收藏' },
      { pagePath: '/pages/tags/index', text: '标签' },
      { pagePath: '/pages/me/index', text: '我的' },
    ],
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const idx = Number(e.currentTarget.dataset.idx);
      const target = this.data.list[idx];
      if (!target) return;
      this.setData({ active: idx });
      wx.switchTab({ url: target.pagePath });
    },
  },
});
```

`apps/miniapp/miniprogram/custom-tab-bar/index.wxml`:
```html
<view class="bar">
  <view
    wx:for="{{list}}"
    wx:key="pagePath"
    class="item {{active === index ? 'item--active' : ''}}"
    data-idx="{{index}}"
    bindtap="onTap"
  >
    <view class="dot"></view>
    <view class="label">{{item.text}}</view>
  </view>
</view>
```

`apps/miniapp/miniprogram/custom-tab-bar/index.wxss`:
```css
.bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 110rpx;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--paper-cream);
  border-top: 1px solid var(--paper-aged);
  display: flex;
  z-index: 100;
}
.item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: var(--ink-secondary);
}
.item--active { color: var(--ink-primary); }
.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: currentColor;
  opacity: .35;
}
.item--active .dot { opacity: 1; background: var(--ink-sticker); }
.label { font-size: 22rpx; }
```

- [ ] **Step 3: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/pages/timeline apps/miniapp/miniprogram/pages/favorites apps/miniapp/miniprogram/pages/tags apps/miniapp/miniprogram/pages/me apps/miniapp/miniprogram/custom-tab-bar
git commit -m "feat(miniapp): 4 tab placeholder pages + custom tabBar shell"
```

---

## Task 12: Login page

**Files:**
- Create: `apps/miniapp/miniprogram/pages/login/index.{ts,wxml,wxss,json}`

Login is the entry page when no session exists. It has one big "微信一键进入" button. On tap: call `wx.login()` → POST `/api/auth/wechat-login` → branch:
- `bound` → `authStore.setSession(...)` → `wx.switchTab('/pages/timeline/index')`
- `unbound` → `wx.navigateTo('/pages/bind/index?bindToken=...')`

- [ ] **Step 1: Create `apps/miniapp/miniprogram/pages/login/index.json`**

```json
{ "navigationBarTitleText": "朝夕居", "navigationStyle": "default", "usingComponents": {} }
```

- [ ] **Step 2: Create `apps/miniapp/miniprogram/pages/login/index.wxml`**

```html
<view class="page">
  <view class="hero">
    <view class="brand">朝夕居</view>
    <view class="tagline">收纳烟火日常</view>
    <view class="tagline tagline--sub">酿造专属回忆</view>
  </view>

  <button class="primary" disabled="{{loading}}" bindtap="onWechatLogin">
    {{loading ? '请稍候...' : '微信一键进入'}}
  </button>

  <view class="secondary" bindtap="onGoRegister">
    没有朝夕居账号？用邀请码注册
  </view>

  <view wx:if="{{error}}" class="error">{{error}}</view>
</view>
```

- [ ] **Step 3: Create `apps/miniapp/miniprogram/pages/login/index.wxss`**

```css
.page {
  min-height: 100vh;
  padding: 200rpx 48rpx 80rpx;
  background: var(--paper-cream);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hero { text-align: center; margin-bottom: 120rpx; }
.brand {
  font-size: 96rpx;
  font-weight: 600;
  color: var(--ink-primary);
  letter-spacing: 8rpx;
}
.tagline {
  margin-top: 16rpx;
  font-size: 32rpx;
  color: var(--ink-secondary);
}
.tagline--sub { margin-top: 4rpx; }
.primary {
  width: 100%;
  background: var(--ink-primary);
  color: #FBF4E4;
  padding: 28rpx 0;
  border-radius: 999rpx;
  font-size: 32rpx;
  letter-spacing: 4rpx;
}
.primary[disabled] { opacity: .6; }
.secondary {
  margin-top: 48rpx;
  font-size: 26rpx;
  color: var(--ink-secondary);
  text-decoration: underline;
}
.error {
  margin-top: 32rpx;
  font-size: 26rpx;
  color: var(--ink-sticker);
  text-align: center;
}
```

- [ ] **Step 4: Create `apps/miniapp/miniprogram/pages/login/index.ts`**

```typescript
import { wxLogin, wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

interface LoginBoundResponse {
  status: 'bound';
  user: { id: string; username: string; displayName: string; avatarKey: string | null; hasWechatBound: boolean };
  accessToken: string;
  refreshToken: string;
}
interface LoginUnboundResponse {
  status: 'unbound';
  bindToken: string;
}
type LoginResponse = LoginBoundResponse | LoginUnboundResponse;

Page({
  data: { loading: false, error: '' },

  async onWechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const code = await wxLogin();
      const res = await api.request<LoginResponse>({
        url: endpoints.wechatLogin(),
        method: 'POST',
        data: { code },
      });
      if (res.statusCode !== 200) {
        const err = (res.data as { error?: { message?: string } })?.error?.message ?? '登录失败';
        this.setData({ loading: false, error: err });
        return;
      }
      if (res.data.status === 'bound') {
        authStore.setSession({
          user: res.data.user,
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
        });
        wxShowToast('欢迎回来', 'success');
        wx.switchTab({ url: '/pages/timeline/index' });
      } else {
        wx.navigateTo({
          url: `/pages/bind/index?bindToken=${encodeURIComponent(res.data.bindToken)}`,
        });
        this.setData({ loading: false });
      }
    } catch (e) {
      this.setData({
        loading: false,
        error: e instanceof Error ? e.message : '网络异常',
      });
    }
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pkgOnboarding/register/index' });
  },
});
```

- [ ] **Step 5: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/pages/login
git commit -m "feat(miniapp): login page — wx.login -> wechat-login -> bound/unbound branch"
```

---

## Task 13: Bind page

**Files:**
- Create: `apps/miniapp/miniprogram/pages/bind/index.{ts,wxml,wxss,json}`

Bind page receives `bindToken` via `onLoad` query param. User enters daynest username + password. POST `/api/auth/wechat-bind` → on success, `authStore.setSession` + `wx.switchTab` to timeline. On failure, show error and offer "我没有朝夕居账号 → 去注册" link.

- [ ] **Step 1: Create `apps/miniapp/miniprogram/pages/bind/index.json`**

```json
{ "navigationBarTitleText": "绑定账号", "usingComponents": {} }
```

- [ ] **Step 2: Create `apps/miniapp/miniprogram/pages/bind/index.wxml`**

```html
<view class="page">
  <view class="heading">绑定朝夕居账号</view>
  <view class="hint">把你的微信和已有的朝夕居账号关联起来。</view>

  <view class="field">
    <view class="label">登录名</view>
    <input
      class="input"
      placeholder="输入登录名"
      value="{{username}}"
      bindinput="onUsername"
    />
  </view>

  <view class="field">
    <view class="label">密码</view>
    <input
      class="input"
      type="safe-password"
      password="{{true}}"
      placeholder="输入密码"
      value="{{password}}"
      bindinput="onPassword"
    />
  </view>

  <button class="primary" disabled="{{!canSubmit || loading}}" bindtap="onSubmit">
    {{loading ? '绑定中...' : '绑定并进入'}}
  </button>

  <view wx:if="{{error}}" class="error">{{error}}</view>

  <view class="secondary" bindtap="onGoRegister">
    没有账号？用邀请码注册
  </view>
</view>
```

- [ ] **Step 3: Create `apps/miniapp/miniprogram/pages/bind/index.wxss`**

```css
.page {
  min-height: 100vh;
  padding: 80rpx 48rpx;
  background: var(--paper-cream);
  display: flex;
  flex-direction: column;
}
.heading { font-size: 48rpx; color: var(--ink-primary); margin-bottom: 8rpx; }
.hint { font-size: 26rpx; color: var(--ink-secondary); margin-bottom: 64rpx; }
.field { margin-bottom: 32rpx; }
.label { font-size: 24rpx; color: var(--ink-secondary); margin-bottom: 8rpx; }
.input {
  background: #FFFCF5;
  padding: 20rpx 24rpx;
  border-radius: 6rpx;
  font-size: 30rpx;
  border: 1px solid var(--paper-aged);
}
.primary {
  margin-top: 32rpx;
  background: var(--ink-primary);
  color: #FBF4E4;
  padding: 28rpx 0;
  border-radius: 999rpx;
  font-size: 32rpx;
}
.primary[disabled] { opacity: .55; }
.error {
  margin-top: 24rpx;
  font-size: 26rpx;
  color: var(--ink-sticker);
}
.secondary {
  margin-top: auto;
  padding-top: 80rpx;
  font-size: 26rpx;
  color: var(--ink-secondary);
  text-decoration: underline;
  align-self: center;
}
```

- [ ] **Step 4: Create `apps/miniapp/miniprogram/pages/bind/index.ts`**

```typescript
import { wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';
import type { UserDTO } from '@daynest/shared';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

interface BindResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

Page({
  data: {
    bindToken: '',
    username: '',
    password: '',
    canSubmit: false,
    loading: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const bindToken = decodeURIComponent(query.bindToken ?? '');
    if (!bindToken) {
      this.setData({ error: '缺少绑定令牌，请回登录页重试。' });
      return;
    }
    this.setData({ bindToken });
  },

  onUsername(e: WechatMiniprogram.Input) {
    this.setData({ username: e.detail.value, canSubmit: this.computeCanSubmit(e.detail.value, this.data.password) });
  },
  onPassword(e: WechatMiniprogram.Input) {
    this.setData({ password: e.detail.value, canSubmit: this.computeCanSubmit(this.data.username, e.detail.value) });
  },
  computeCanSubmit(u: string, p: string): boolean {
    return u.length >= 1 && p.length >= 8;
  },

  async onSubmit() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    const res = await api.request<BindResponse>({
      url: endpoints.wechatBind(),
      method: 'POST',
      data: {
        bindToken: this.data.bindToken,
        username: this.data.username,
        password: this.data.password,
      },
    });
    if (res.statusCode !== 200) {
      const body = res.data as { error?: { code?: string; message?: string } };
      const code = body.error?.code ?? '';
      const message =
        code === 'CREDENTIALS_INVALID' ? '登录名或密码不正确'
        : code === 'USER_ALREADY_BOUND' ? '此账号已绑定其他微信'
        : code === 'WECHAT_ALREADY_BOUND' ? '此微信已绑定其他账号'
        : code === 'BIND_TOKEN_INVALID' ? '绑定令牌已失效，请回登录页重试'
        : body.error?.message ?? '绑定失败';
      this.setData({ loading: false, error: message });
      return;
    }
    authStore.setSession({
      user: res.data.user,
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken,
    });
    wxShowToast('绑定成功', 'success');
    wx.switchTab({ url: '/pages/timeline/index' });
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pkgOnboarding/register/index' });
  },
});
```

- [ ] **Step 5: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/pages/bind
git commit -m "feat(miniapp): bind page — daynest username+password against /api/auth/wechat-bind"
```

---

## Task 14: Register page (in `pkgOnboarding`)

**Files:**
- Create: `apps/miniapp/miniprogram/pkgOnboarding/register/index.{ts,wxml,wxss,json}`

Register page reuses the bindToken from the previous wechat-login call. If the user navigated here from the login page without a `bindToken`, we re-run `wx.login` + `/api/auth/wechat-login` first, then continue.

Form fields: `inviteToken` (manual paste), `username`, `displayName`, `password`. POST `/api/auth/wechat-register` → on success, `authStore.setSession` + `wx.switchTab` to timeline.

- [ ] **Step 1: Create `apps/miniapp/miniprogram/pkgOnboarding/register/index.json`**

```json
{ "navigationBarTitleText": "注册朝夕居", "usingComponents": {} }
```

- [ ] **Step 2: Create `apps/miniapp/miniprogram/pkgOnboarding/register/index.wxml`**

```html
<view class="page">
  <view class="heading">注册朝夕居</view>
  <view class="hint">用邀请码注册一个新账号，同时绑定当前微信。</view>

  <view class="field">
    <view class="label">邀请码</view>
    <input class="input" placeholder="粘贴家人发给你的邀请码" value="{{inviteToken}}" bindinput="onInviteToken"/>
  </view>

  <view class="field">
    <view class="label">登录名（3-32位字母数字下划线）</view>
    <input class="input" placeholder="如 zhang_san" value="{{username}}" bindinput="onUsername"/>
  </view>

  <view class="field">
    <view class="label">展示名</view>
    <input class="input" placeholder="家人看到的名字，可中文/emoji" value="{{displayName}}" bindinput="onDisplayName"/>
  </view>

  <view class="field">
    <view class="label">密码（至少 8 位）</view>
    <input class="input" type="safe-password" password="{{true}}" placeholder="为账号设置密码" value="{{password}}" bindinput="onPassword"/>
  </view>

  <button class="primary" disabled="{{!canSubmit || loading}}" bindtap="onSubmit">
    {{loading ? '注册中...' : '注册并进入'}}
  </button>

  <view wx:if="{{error}}" class="error">{{error}}</view>
</view>
```

- [ ] **Step 3: Create `apps/miniapp/miniprogram/pkgOnboarding/register/index.wxss`**

```css
.page {
  min-height: 100vh;
  padding: 80rpx 48rpx;
  background: var(--paper-cream);
  display: flex;
  flex-direction: column;
}
.heading { font-size: 48rpx; color: var(--ink-primary); margin-bottom: 8rpx; }
.hint { font-size: 26rpx; color: var(--ink-secondary); margin-bottom: 48rpx; }
.field { margin-bottom: 28rpx; }
.label { font-size: 24rpx; color: var(--ink-secondary); margin-bottom: 8rpx; }
.input {
  background: #FFFCF5;
  padding: 20rpx 24rpx;
  border-radius: 6rpx;
  font-size: 30rpx;
  border: 1px solid var(--paper-aged);
}
.primary {
  margin-top: 32rpx;
  background: var(--ink-primary);
  color: #FBF4E4;
  padding: 28rpx 0;
  border-radius: 999rpx;
  font-size: 32rpx;
}
.primary[disabled] { opacity: .55; }
.error {
  margin-top: 24rpx;
  font-size: 26rpx;
  color: var(--ink-sticker);
}
```

- [ ] **Step 4: Create `apps/miniapp/miniprogram/pkgOnboarding/register/index.ts`**

```typescript
import { wxLogin, wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';
import type { UserDTO } from '@daynest/shared';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

interface RegisterResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

Page({
  data: {
    inviteToken: '',
    username: '',
    displayName: '',
    password: '',
    canSubmit: false,
    loading: false,
    error: '',
  },

  onInviteToken(e: WechatMiniprogram.Input) { this.update({ inviteToken: e.detail.value }); },
  onUsername(e: WechatMiniprogram.Input) { this.update({ username: e.detail.value }); },
  onDisplayName(e: WechatMiniprogram.Input) { this.update({ displayName: e.detail.value }); },
  onPassword(e: WechatMiniprogram.Input) { this.update({ password: e.detail.value }); },

  update(partial: Partial<{ inviteToken: string; username: string; displayName: string; password: string }>) {
    const merged = { ...this.data, ...partial };
    const canSubmit =
      merged.inviteToken.length >= 8 &&
      USERNAME_RE.test(merged.username) &&
      merged.displayName.length >= 1 &&
      merged.password.length >= 8;
    this.setData({ ...partial, canSubmit });
  },

  async onSubmit() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const code = await wxLogin();
      const loginRes = await api.request<{ status: string; bindToken?: string }>({
        url: endpoints.wechatLogin(),
        method: 'POST',
        data: { code },
      });
      if (loginRes.statusCode !== 200 || loginRes.data.status !== 'unbound' || !loginRes.data.bindToken) {
        this.setData({ loading: false, error: '此微信不可注册（可能已绑定）' });
        return;
      }
      const bindToken = loginRes.data.bindToken;
      const res = await api.request<RegisterResponse>({
        url: endpoints.wechatRegister(),
        method: 'POST',
        data: {
          bindToken,
          inviteToken: this.data.inviteToken,
          username: this.data.username,
          displayName: this.data.displayName,
          password: this.data.password,
        },
      });
      if (res.statusCode !== 200) {
        const body = res.data as { error?: { code?: string; message?: string } };
        const code2 = body.error?.code ?? '';
        const message =
          code2 === 'INVALID_INVITE' ? '邀请码无效或已过期'
          : code2 === 'INVITE_ALREADY_USED' ? '邀请码已被使用'
          : code2 === 'USERNAME_TAKEN' ? '登录名已被占用'
          : code2 === 'WECHAT_ALREADY_BOUND' ? '此微信已绑定其他账号'
          : code2 === 'BIND_TOKEN_INVALID' ? '请稍后重试'
          : body.error?.message ?? '注册失败';
        this.setData({ loading: false, error: message });
        return;
      }
      authStore.setSession({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      });
      wxShowToast('欢迎加入朝夕居', 'success');
      wx.switchTab({ url: '/pages/timeline/index' });
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '网络异常' });
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
git add apps/miniapp/miniprogram/pkgOnboarding/register
git commit -m "feat(miniapp): register page in pkgOnboarding — invite-driven signup"
```

---

## Task 15: `app.ts` boot routing + smoke test

**Files:**
- Modify: `apps/miniapp/miniprogram/app.ts`
- Create: `apps/miniapp/tests/smoke.test.ts`

`app.ts` needs to hydrate stores and decide whether to redirect to login. Since `App.onLaunch` runs before any page, and pages decide their own onLoad logic, we keep `app.ts` minimal: hydrate the two stores, listen for theme changes. The first page in `app.json.pages` (`pages/login/index`) is the cold-launch landing; if `authStore` reveals a hydrated session, the login page itself redirects to the timeline tab in `onShow`.

(We deliberately don't try to override `app.json`'s entry page dynamically — WeChat doesn't support it. The login page is the universal cold-launch surface and does its own re-route in ~50ms.)

- [ ] **Step 1: Update `apps/miniapp/miniprogram/app.ts`**

```typescript
import { authStore } from './stores/authStore.js';
import { themeStore } from './stores/themeStore.js';

App({
  onLaunch() {
    authStore.hydrate();
    themeStore.hydrate();
    wx.onThemeChange?.(() => themeStore.refresh());
  },
  onShow() {},
});
```

- [ ] **Step 2: Update the login page to redirect when already signed in**

Modify `apps/miniapp/miniprogram/pages/login/index.ts` — add `onShow`:

```typescript
// ... existing imports + api setup ...
Page({
  data: { loading: false, error: '' },

  onShow() {
    const s = authStore.getState();
    if (s.hydrated && s.accessToken && s.user) {
      wx.switchTab({ url: '/pages/timeline/index' });
    }
  },

  async onWechatLogin() { /* unchanged */ },
  onGoRegister() { /* unchanged */ },
});
```

(Keep the existing `onWechatLogin` and `onGoRegister` bodies as-is; only insert the `onShow` between `data` and `onWechatLogin`.)

- [ ] **Step 3: Write the smoke test**

Create `apps/miniapp/tests/smoke.test.ts`. This test exercises the full auth flow against a **real Fastify test server** so we get end-to-end verification of mini-app code ↔ Plan 01 API. We import the API's `buildApp` helper and seed an inviter + invite, just like `apps/api/tests/wechat/smoke.test.ts`.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from './helpers/wxMock.js';
import { authStore } from '../miniprogram/stores/authStore.js';
import { createApiClient } from '../miniprogram/lib/api.js';

// We mock wx.request to ALWAYS go through a function we control. The actual
// HTTP fetch hits the real Fastify app via inject(). This is the most honest
// integration test we can run outside of WeChat DevTools.
import { buildApp } from '../../api/tests/helpers/buildApp.js';
import { FakeWechatClient } from '../../api/tests/helpers/wechat.fake.js';
import { createInvite } from '../../api/src/services/invites.js';
import { hashPassword } from '../../api/src/auth/password.js';

describe('miniapp ↔ api auth smoke', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let wechat: FakeWechatClient;

  beforeEach(async () => {
    mock = installWxMock();
    wechat = new FakeWechatClient();
    ctx = await buildApp({ wechat });
    authStore.reset();

    // Rewire the wx.request mock to actually hit the Fastify app via inject().
    (globalThis as Record<string, unknown>).wx = {
      ...((globalThis as Record<string, unknown>).wx as object),
      getStorageSync: (k: string) => mock.storage.get(k) ?? '',
      setStorageSync: (k: string, v: unknown) => { mock.storage.set(k, v); },
      removeStorageSync: (k: string) => { mock.storage.delete(k); },
      login: (o: { success: (r: { code: string }) => void }) => {
        Promise.resolve().then(() => o.success({ code: 'wx-smoke-code' }));
      },
      request: (o: { url: string; method?: string; data?: unknown; header?: Record<string, string>; success: (r: { statusCode: number; data: unknown }) => void; fail: (e: unknown) => void }) => {
        const path = new URL(o.url).pathname;
        ctx.app.inject({
          method: (o.method ?? 'GET') as 'GET' | 'POST',
          url: path,
          payload: o.data as Record<string, unknown> | undefined,
          headers: o.header,
        }).then((res) => o.success({ statusCode: res.statusCode, data: res.json() }))
          .catch(o.fail);
        return { abort: () => undefined };
      },
    };
  });

  afterEach(async () => {
    uninstallWxMock();
    await ctx.cleanup();
  });

  it('register → tab landing: new wechat user with valid invite registers + lands in tab', async () => {
    // Seed inviter + invite
    const inviter = await ctx.prisma.user.create({
      data: {
        username: 'inviter',
        displayName: 'Inviter',
        passwordHash: await hashPassword('inviterpw123'),
      },
    });
    const invite = await createInvite(ctx.prisma, inviter.id, 24);
    wechat.setCode('wx-smoke-code', 'openid-smoke');

    const api = createApiClient({
      tokens: authStore,
      refreshUrl: 'http://localhost/api/auth/refresh-token',
    });

    // Step 1: wechat-login → expect unbound
    const loginRes = await api.request<{ status: string; bindToken?: string }>({
      url: 'http://localhost/api/auth/wechat-login',
      method: 'POST',
      data: { code: 'wx-smoke-code' },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.data.status).toBe('unbound');
    expect(loginRes.data.bindToken).toBeTruthy();

    // Step 2: wechat-register
    const regRes = await api.request<{ user: { id: string; hasWechatBound: boolean }; accessToken: string; refreshToken: string }>({
      url: 'http://localhost/api/auth/wechat-register',
      method: 'POST',
      data: {
        bindToken: loginRes.data.bindToken,
        inviteToken: invite.token,
        username: 'smokie',
        displayName: 'Smokie',
        password: 'password123',
      },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.data.user.hasWechatBound).toBe(true);

    authStore.setSession({
      user: regRes.data.user as never,
      accessToken: regRes.data.accessToken,
      refreshToken: regRes.data.refreshToken,
    });
    expect(authStore.getState().accessToken).toBe(regRes.data.accessToken);
    expect(mock.storage.get('daynest.auth.access')).toBe(regRes.data.accessToken);
  });

  it('bound user: a second wechat-login with same openid returns tokens directly', async () => {
    // Pre-seed a user with the openid already bound
    await ctx.prisma.user.create({
      data: {
        username: 'oldie',
        displayName: 'Oldie',
        passwordHash: await hashPassword('oldiepw123'),
        wechatOpenId: 'openid-old',
        wechatBoundAt: new Date(),
      },
    });
    wechat.setCode('wx-old-code', 'openid-old');

    const api = createApiClient({
      tokens: authStore,
      refreshUrl: 'http://localhost/api/auth/refresh-token',
    });

    const res = await api.request<{ status: string; accessToken?: string; user?: { username: string } }>({
      url: 'http://localhost/api/auth/wechat-login',
      method: 'POST',
      data: { code: 'wx-old-code' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.data.status).toBe('bound');
    expect(res.data.accessToken).toBeTruthy();
    expect(res.data.user?.username).toBe('oldie');
  });
});
```

- [ ] **Step 4: Run the full miniapp suite**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: all tests across `store`, `storage`, `wxBridge`, `api`, `authStore`, `themeStore`, and `smoke` pass.

- [ ] **Step 5: Run typecheck across the workspace**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/api exec tsc --noEmit
pnpm --filter @daynest/shared build
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/app.ts apps/miniapp/miniprogram/pages/login/index.ts apps/miniapp/tests/smoke.test.ts
git commit -m "feat(miniapp): app.ts boot wiring + end-to-end auth smoke test against real API"
```

---

## Post-plan verification (manual)

These steps run AFTER the 15 commits and don't require a code change. Skip if you're just running the plan inline.

### 1. Open in WeChat DevTools (manual)

```
1. Install WeChat DevTools from https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
2. cd apps/miniapp && cp project.private.config.json.example project.private.config.json
   (Edit the appid to your registered AppID, or keep it blank for tourist mode.)
3. Run: pnpm --filter @daynest/miniapp tokens
4. Run: pnpm --filter @daynest/miniapp build:watch  (keep running)
5. In DevTools: 导入项目 → select apps/miniapp/
6. Settings → 不校验合法域名 (for localhost dev)
7. Start backend: pnpm --filter @daynest/api dev
8. Reload the simulator. Login page should appear.
9. Tap 微信一键进入 → DevTools simulates wx.login → backend returns unbound → bind page
   (you need a real registered AppID for jscode2session to succeed against api.weixin.qq.com;
    with the tourist appid, the backend will return WECHAT_CODE_INVALID and you'll need
    to register a real AppID before proceeding).
```

### 2. Wire up a real AppID (manual, once)

```
1. Register a personal mini-program AppID at https://mp.weixin.qq.com
2. Update apps/api/.env with the real WECHAT_APPID + WECHAT_APP_SECRET
3. Restart the api dev server
4. Update apps/miniapp/project.private.config.json with the real appid
5. Now wx.login → jscode2session works end-to-end
```

These are gated on the user owning a real WeChat mini-program AppID, which is the spec's documented external dependency (see §8.1 of the design spec).

---

## Self-Review

**Spec coverage** (against `2026-05-22-miniapp-design.md`):
- §1.1 monorepo落点 — Task 1 ✅
- §1.2 编译/构建链 — Task 1 (tsc -w) ✅
- §1.3 跨端代码复用 — Task 2 (design-tokens) ✅
- §1.4 状态管理 — Tasks 4, 9, 10 ✅
- §1.5 API client — Task 8 ✅
- §1.6 与现有后端的交互边界 — Tasks 7-8, 12-15 (covers login/bind/register/refresh-token) ✅; subscribe and unbind covered later in Plan 05
- §2.1-2.4 鉴权流程 — Tasks 12, 13, 14, 15 ✅
- §2.5 微信切号 — explicitly out of scope (D10) ✅
- §3.1 TabBar — Task 11 ✅
- §3.2 全部页面清单 — covered: login/bind/timeline/favorites/tags/me/register; others (collection/viewer/upload/tag pinboard/etc.) deferred to Plans 03/04/05
- §3.3 分包大小 — observed via `pnpm build` size check, not enforced this plan
- §3.4 分包预下载 — only `pkgOnboarding` exists in this plan; preload rule added when more subpackages land in Plan 03
- §3.5 渲染引擎 — default WebView (D12) ✅
- §3.6 导航选择 — `switchTab` / `navigateTo` / `reLaunch` all used appropriately ✅
- §4.1 调色板 — Tasks 2, 3 ✅
- §4.2 字体子集化 — explicitly out of scope, deferred to Plan 06
- §4.5 暗夜模式 — Tasks 3, 10 (variables + store; per-page `.dark` class binding lands when more pages do)

**Placeholder scan:**
- All steps have concrete code or commands. No "TODO", "TBD", "similar to", "handle errors appropriately" found.
- Manual verification steps in §"Post-plan verification" are intentionally manual because they require external assets (DevTools, AppID).

**Type consistency:**
- `TokenProvider` defined in Task 8 (`api.ts`), consumed by `authStore` in Task 9 via `satisfies TokenProvider`. Names match: `getAccessToken`, `getRefreshToken`, `setTokens`, `clearTokens`. ✅
- `UserDTO` imported from `@daynest/shared`; `hasWechatBound` is the field added in Plan 01 Task 4. ✅
- `ThemeMode` from `@daynest/shared/design-tokens` consumed in `themeStore`. ✅
- `endpoints.refreshToken()` from Task 7 used in Tasks 12, 13, 14. ✅
- `AUTH_STORAGE_KEYS` from Task 9 used in tests and indirectly via `storage` calls. ✅

---

## Done criteria

After all 15 commits:
- `pnpm --filter @daynest/miniapp test` passes (≥ 30 tests across store/storage/wxBridge/api/authStore/themeStore/smoke)
- `pnpm --filter @daynest/miniapp build` passes (tsc clean)
- `pnpm --filter @daynest/shared test` still passes (3 new design-tokens tests + existing wechat tests)
- `pnpm --filter @daynest/api test` still passes (154 from Plan 01 — no api code touched)
- `apps/miniapp/miniprogram/` contains the full directory tree shown in §1.1 of the spec (subset — collection/upload/tags subpackages come in later plans)
- Manual DevTools verification (Task 15 post-plan section) succeeds with a real AppID

—— end of plan
