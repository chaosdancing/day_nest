# Mini-Program v1 — Plan 01 · Backend WeChat Auth Extension

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `apps/api` Fastify server with the WeChat-specific authentication and bearer-token refresh endpoints required by the mini-program, without breaking any existing web behavior.

**Architecture:** Adds 2 columns to `User`, 1 new `WechatSubscription` table, a new `WechatClient` SDK wrapper module with file-backed access-token caching, and 6 new HTTP routes (`/api/auth/wechat-{login,bind,register,unbind}`, `/api/auth/refresh-token`, `/api/wechat/subscribe`). The existing cookie-based `/api/auth/refresh` is untouched so the web client keeps working. All new logic flows through a `WechatClient` interface that is mocked in tests — no test ever hits `api.weixin.qq.com`.

**Tech Stack:** Node 20 · Fastify 4 · TypeScript · Prisma 5 (SQLite) · Zod · Vitest · jose (JWT) · argon2 (already in deps) · pnpm workspaces (no new runtime deps required)

**Companion spec:** [`../specs/2026-05-22-miniapp-design.md`](../specs/2026-05-22-miniapp-design.md)

**Scope of this plan:**
- ✅ Schema + migration
- ✅ Config + env wiring
- ✅ `packages/shared/wechat.ts` types
- ✅ `UserDTO.hasWechatBound` flag
- ✅ `WechatClient` interface + real impl + test fake
- ✅ Access token cache (in-process + file-backed)
- ✅ Bind-session JWT helper
- ✅ 6 new routes with full test coverage

**Out of scope (separate plans):**
- ❌ Subscribe message **sending** (separate plan: `02-backend-subscribe.md`)
- ❌ Mini-program client code (separate plans: `03-09`)
- ❌ Documentation updates to `tencent-server-setup.md` (handled in `09-release.md`)

---

## File Structure

### New files
| Path | Purpose |
|---|---|
| `apps/api/prisma/migrations/2026XXXXXXXXXX_add_wechat_binding/migration.sql` | Add `User.wechatOpenId`, `User.wechatBoundAt`, `WechatSubscription` table |
| `apps/api/src/wechat/types.ts` | TypeScript interfaces for jscode2session response, errors |
| `apps/api/src/wechat/client.ts` | `WechatClient` interface + `RealWechatClient` implementation |
| `apps/api/src/wechat/accessTokenCache.ts` | In-process + file-backed access_token cache |
| `apps/api/src/auth/bindToken.ts` | sign/verify bind-session JWT (5-min TTL, separate `typ`) |
| `apps/api/src/routes/wechat.ts` | New route file holding all wechat-* auth routes + subscribe-auth route |
| `apps/api/tests/wechat/client.test.ts` | Unit tests for jsCode2Session / getAccessToken |
| `apps/api/tests/wechat/accessTokenCache.test.ts` | Cache expiry, file persistence, refresh-before-expiry |
| `apps/api/tests/wechat/bindToken.test.ts` | Sign/verify, expiry, wrong-typ rejection |
| `apps/api/tests/wechat/login.test.ts` | `POST /api/auth/wechat-login` (bound + unbound paths) |
| `apps/api/tests/wechat/bind.test.ts` | `POST /api/auth/wechat-bind` (all 5 error codes) |
| `apps/api/tests/wechat/register.test.ts` | `POST /api/auth/wechat-register` |
| `apps/api/tests/wechat/unbind.test.ts` | `POST /api/auth/wechat-unbind` |
| `apps/api/tests/wechat/refreshToken.test.ts` | `POST /api/auth/refresh-token` body-mode |
| `apps/api/tests/wechat/subscribe.test.ts` | `POST /api/wechat/subscribe` |
| `apps/api/tests/helpers/wechat.fake.ts` | `FakeWechatClient` for injection in tests |
| `packages/shared/src/wechat.ts` | Zod schemas + response types for all 6 endpoints |
| `apps/api/.env.example` | Document required env vars including new WeChat ones |

### Modified files
| Path | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add 2 fields to `User`, add `WechatSubscription` model |
| `apps/api/src/config.ts` | Add `wechat` sub-config + `WECHAT_*` env schema |
| `apps/api/src/server.ts` | Add `WechatClient` to `AppDeps`, register `registerWechatRoutes` |
| `apps/api/src/routes/auth.ts` | Update `toUserDTO` to include `hasWechatBound: Boolean(u.wechatOpenId)` |
| `apps/api/tests/helpers/buildApp.ts` | Inject `FakeWechatClient` into deps |
| `apps/api/tests/helpers/db.ts` | Add `'WechatSubscription'` to TABLES truncate list |
| `packages/shared/src/auth.ts` | Add `hasWechatBound: boolean` to `UserDTO` |
| `packages/shared/src/index.ts` | `export * from './wechat.js';` |
| `apps/api/.env.test` | Add dummy `WECHAT_APPID` / `WECHAT_APP_SECRET` |

---

## Conventions Used Throughout This Plan

- **TDD per task**: write failing test → run → minimal impl → run → commit. Each task is one commit.
- **Run tests from repo root**: `cd /Users/bytedance/work/ai/day_nest && pnpm --filter @daynest/api test -- <path>` (Vitest pattern filter).
- **Run all api tests**: `pnpm --filter @daynest/api test`.
- **Run typecheck**: `pnpm --filter @daynest/api build` (tsc, no emit needed but catches errors).
- **Migration name format**: `YYYYMMDDHHMMSS_add_wechat_binding` — use real current timestamp at execution time.
- **Commit message format**: Conventional Commits (`feat:`, `test:`, `chore:`, `refactor:`).

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/{TIMESTAMP}_add_wechat_binding/migration.sql`
- Modify: `apps/api/tests/helpers/db.ts:29-38` (TABLES list)

- [ ] **Step 1: Update Prisma schema**

Edit `apps/api/prisma/schema.prisma`. Inside the `User` model, after `createdAt DateTime @default(now())`:

```prisma
model User {
  id            String   @id @default(uuid())
  username      String   @unique
  displayName   String
  passwordHash  String
  avatarKey     String?
  createdAt     DateTime @default(now())
  wechatOpenId  String?  @unique
  wechatBoundAt DateTime?

  collections   Collection[]    @relation("CollectionCreator")
  photos        Photo[]         @relation("PhotoUploader")
  invitesIssued Invite[]        @relation("InviteIssuer")
  tagsCreated   Tag[]           @relation("TagCreator")
  favorites     PhotoFavorite[] @relation("UserFavorites")
  wechatSubs    WechatSubscription[]
}
```

At the bottom of the file (after the last existing model), add:

```prisma
model WechatSubscription {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  templateId  String
  quota       Int      @default(0)
  updatedAt   DateTime @updatedAt

  @@unique([userId, templateId])
  @@index([userId])
}
```

- [ ] **Step 2: Generate migration**

Run from `apps/api/`:

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_wechat_binding --create-only
```

This generates `prisma/migrations/{TIMESTAMP}_add_wechat_binding/migration.sql`. Open it and **verify** it contains exactly:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "wechatOpenId" TEXT;
ALTER TABLE "User" ADD COLUMN "wechatBoundAt" DATETIME;

-- CreateTable
CREATE TABLE "WechatSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WechatSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_wechatOpenId_key" ON "User"("wechatOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "WechatSubscription_userId_templateId_key" ON "WechatSubscription"("userId", "templateId");

-- CreateIndex
CREATE INDEX "WechatSubscription_userId_idx" ON "WechatSubscription"("userId");
```

If Prisma generated something different (e.g., missing the `@@index([userId])` — depends on prisma version) edit the file manually to match. Don't apply yet.

- [ ] **Step 3: Apply migration**

```bash
cd apps/api
pnpm exec prisma migrate dev   # applies migration to dev.db and regenerates client
```

Expected output ends with `Your database is now in sync with your schema.`

- [ ] **Step 4: Update test DB helper TABLES list**

Edit `apps/api/tests/helpers/db.ts`. Find the `TABLES` const at line ~29 and add `'WechatSubscription'` to it. The new list:

```typescript
const TABLES = [
  'PhotoFavorite',
  'PhotoTag',
  'CollectionTag',
  'Photo',
  'Collection',
  'Invite',
  'Tag',
  'WechatSubscription',
  'User',
];
```

Order matters: child tables before parent (cascade direction). `WechatSubscription` references `User` so it goes before `User`.

- [ ] **Step 5: Verify all existing tests still pass**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm --filter @daynest/api test
```

Expected: all pre-existing tests pass (no regression from schema change). The new `WechatSubscription` table just exists empty.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma \
        apps/api/prisma/migrations/ \
        apps/api/tests/helpers/db.ts
git commit -m "feat(api): add User.wechatOpenId + WechatSubscription schema"
```

---

## Task 2: WeChat config in env + config.ts

**Files:**
- Modify: `apps/api/src/config.ts`
- Create: `apps/api/.env.example`
- Modify: `apps/api/.env.test`
- Create: `apps/api/tests/config.wechat.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/config.wechat.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./test.db',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  QINIU_ACCESS_KEY: 'ak',
  QINIU_SECRET_KEY: 'sk',
  QINIU_BUCKET: 'bucket',
  QINIU_DOMAIN: 'https://cdn.example.com',
};

describe('config.wechat', () => {
  it('exposes enabled=false when credentials missing', () => {
    const cfg = loadConfig({ ...baseEnv } as NodeJS.ProcessEnv);
    expect(cfg.wechat.enabled).toBe(false);
    expect(cfg.wechat.appId).toBeUndefined();
    expect(cfg.wechat.appSecret).toBeUndefined();
  });

  it('exposes enabled=true when both credentials present', () => {
    const cfg = loadConfig({
      ...baseEnv,
      WECHAT_APPID: 'wxabc123',
      WECHAT_APP_SECRET: 'secret-xyz-789',
    } as NodeJS.ProcessEnv);
    expect(cfg.wechat.enabled).toBe(true);
    expect(cfg.wechat.appId).toBe('wxabc123');
    expect(cfg.wechat.appSecret).toBe('secret-xyz-789');
  });

  it('exposes accessTokenCachePath when set', () => {
    const cfg = loadConfig({
      ...baseEnv,
      WECHAT_APPID: 'wxabc123',
      WECHAT_APP_SECRET: 'secret-xyz-789',
      WECHAT_ACCESS_TOKEN_CACHE_PATH: '/tmp/wx-token.json',
    } as NodeJS.ProcessEnv);
    expect(cfg.wechat.accessTokenCachePath).toBe('/tmp/wx-token.json');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm --filter @daynest/api test -- tests/config.wechat.test.ts
```

Expected: 3 failures with errors like `Cannot read properties of undefined (reading 'enabled')`.

- [ ] **Step 3: Implement in config.ts**

Edit `apps/api/src/config.ts`. Inside the `Schema` z.object call, add after `COOKIE_DOMAIN`:

```typescript
  WECHAT_APPID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  WECHAT_ACCESS_TOKEN_CACHE_PATH: z.string().optional(),
```

Add to `AppConfig` type, after `cookieDomain?: string;`:

```typescript
  wechat: {
    enabled: boolean;
    appId?: string;
    appSecret?: string;
    accessTokenCachePath?: string;
  };
```

Inside `loadConfig` return object, after `cookieDomain: parsed.COOKIE_DOMAIN,`:

```typescript
    wechat: {
      enabled: Boolean(parsed.WECHAT_APPID && parsed.WECHAT_APP_SECRET),
      appId: parsed.WECHAT_APPID,
      appSecret: parsed.WECHAT_APP_SECRET,
      accessTokenCachePath: parsed.WECHAT_ACCESS_TOKEN_CACHE_PATH,
    },
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/config.wechat.test.ts
```

Expected: 3 passes.

- [ ] **Step 5: Update `.env.test`**

Edit `apps/api/.env.test`. Add at the end:

```
WECHAT_APPID=wx_test_app_id
WECHAT_APP_SECRET=wx_test_app_secret_padded_to_min_length
```

(These are dummy values — actual WeChat calls are always mocked in tests.)

- [ ] **Step 6: Create `.env.example`**

Create `apps/api/.env.example`:

```
# Server
NODE_ENV=development
PORT=3000
CORS_ORIGIN=*

# Database
DATABASE_URL=file:./dev.db

# JWT (both must be >= 32 chars)
JWT_SECRET=replace-me-with-32-or-more-chars-secret
JWT_REFRESH_SECRET=replace-me-with-different-32-or-more-chars

# Token TTLs (seconds)
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
INVITE_TOKEN_TTL_HOURS=72

# Qiniu (private bucket)
QINIU_ACCESS_KEY=
QINIU_SECRET_KEY=
QINIU_BUCKET=
QINIU_DOMAIN=https://cdn.example.com
QINIU_ZONE=z0

# WeChat mini-program (optional — leave empty to disable wechat-* routes)
WECHAT_APPID=
WECHAT_APP_SECRET=
WECHAT_ACCESS_TOKEN_CACHE_PATH=

# Optional
COOKIE_DOMAIN=
```

- [ ] **Step 7: Verify full api test suite still green**

```bash
pnpm --filter @daynest/api test
```

Expected: all green including 3 new config tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/config.ts \
        apps/api/.env.example \
        apps/api/.env.test \
        apps/api/tests/config.wechat.test.ts
git commit -m "feat(api): wire WECHAT_* env into config with enabled flag"
```

---

## Task 3: Shared Zod schemas for WeChat endpoints

**Files:**
- Create: `packages/shared/src/wechat.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/auth.ts` (UserDTO)

- [ ] **Step 1: Write failing test**

Create `packages/shared/src/wechat.test.ts` (Vitest treats `.test.ts` next to source the same way):

```typescript
import { describe, it, expect } from 'vitest';
import {
  WechatLoginInput,
  WechatBindInput,
  WechatRegisterInput,
  RefreshTokenInput,
  SubscribeAuthInput,
  WECHAT_TEMPLATES,
} from './wechat.js';

describe('WechatLoginInput', () => {
  it('accepts valid code', () => {
    expect(WechatLoginInput.parse({ code: 'a'.repeat(20) }).code).toHaveLength(20);
  });
  it('rejects too-short code', () => {
    expect(() => WechatLoginInput.parse({ code: 'abc' })).toThrow();
  });
});

describe('WechatBindInput', () => {
  it('requires all three fields', () => {
    expect(() => WechatBindInput.parse({ bindToken: 'x', username: 'u' })).toThrow();
  });
});

describe('WechatRegisterInput', () => {
  it('enforces username regex from existing RegisterInput', () => {
    expect(() =>
      WechatRegisterInput.parse({
        bindToken: 'x',
        inviteToken: 'invite-token-here',
        username: 'has space',
        displayName: 'Mom',
        password: 'long-enough-password',
      })
    ).toThrow();
  });
});

describe('RefreshTokenInput', () => {
  it('rejects empty', () => {
    expect(() => RefreshTokenInput.parse({})).toThrow();
  });
});

describe('SubscribeAuthInput', () => {
  it('accepts known template id', () => {
    const parsed = SubscribeAuthInput.parse({
      templateId: 'PHOTO_FAVORITED',
      acceptedCount: 1,
    });
    expect(parsed.templateId).toBe('PHOTO_FAVORITED');
  });
  it('rejects unknown template id', () => {
    expect(() =>
      SubscribeAuthInput.parse({ templateId: 'BOGUS', acceptedCount: 1 })
    ).toThrow();
  });
  it('clamps acceptedCount range', () => {
    expect(() =>
      SubscribeAuthInput.parse({ templateId: 'PHOTO_FAVORITED', acceptedCount: 99 })
    ).toThrow();
  });
});

describe('WECHAT_TEMPLATES', () => {
  it('has three known templates', () => {
    expect(WECHAT_TEMPLATES.NEW_PHOTO_IN_FAMILY).toBe('NEW_PHOTO_IN_FAMILY');
    expect(WECHAT_TEMPLATES.PHOTO_FAVORITED).toBe('PHOTO_FAVORITED');
    expect(WECHAT_TEMPLATES.INVITE_ACCEPTED).toBe('INVITE_ACCEPTED');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm --filter @daynest/shared test
```

Expected: cannot find module './wechat.js'.

> **Note:** If `@daynest/shared` doesn't have a `test` script yet, add it: edit `packages/shared/package.json` and add `"test": "vitest run"` plus `"vitest": "^1.6.0"` to devDependencies, then `pnpm install`. Check if Vitest is already a devDep first — likely shared package leans on apps/api's vitest.
>
> If shared lacks test infra entirely, place this test inside `apps/api/tests/wechatSchemas.test.ts` instead, importing from `@daynest/shared/wechat` (or however the package is consumed). Use the apps/api Vitest setup. **Either way, the test must run somewhere before proceeding.**

- [ ] **Step 3: Create `packages/shared/src/wechat.ts`**

```typescript
import { z } from 'zod';
import { UserDTO } from './auth.js';

// -- Login ----------------------------------------------------------------

export const WechatLoginInput = z.object({
  // 微信 wx.login() 返回的 js_code，长度未严格规定但实际 ~32 chars
  code: z.string().min(8).max(128),
});
export type WechatLoginInput = z.infer<typeof WechatLoginInput>;

export const WechatLoginBoundResponse = z.object({
  bound: z.literal(true),
  user: UserDTO,
  accessToken: z.string(),
  refreshToken: z.string(),
});
export const WechatLoginUnboundResponse = z.object({
  bound: z.literal(false),
  bindToken: z.string(),
});
export const WechatLoginResponse = z.discriminatedUnion('bound', [
  WechatLoginBoundResponse,
  WechatLoginUnboundResponse,
]);
export type WechatLoginResponse = z.infer<typeof WechatLoginResponse>;

// -- Bind -----------------------------------------------------------------

export const WechatBindInput = z.object({
  bindToken: z.string().min(1),
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type WechatBindInput = z.infer<typeof WechatBindInput>;

export const WechatBindResponse = z.object({
  user: UserDTO,
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type WechatBindResponse = z.infer<typeof WechatBindResponse>;

// -- Register (invite-driven) --------------------------------------------

export const WechatRegisterInput = z.object({
  bindToken: z.string().min(1),
  inviteToken: z.string().min(8),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
});
export type WechatRegisterInput = z.infer<typeof WechatRegisterInput>;

// -- Refresh (body-mode, mini-program) -----------------------------------

export const RefreshTokenInput = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenInput>;

export const RefreshTokenResponse = z.object({
  user: UserDTO,
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponse>;

// -- Subscribe authorization ---------------------------------------------

export const WECHAT_TEMPLATES = {
  NEW_PHOTO_IN_FAMILY: 'NEW_PHOTO_IN_FAMILY',
  PHOTO_FAVORITED: 'PHOTO_FAVORITED',
  INVITE_ACCEPTED: 'INVITE_ACCEPTED',
} as const;
export type WechatTemplateId = keyof typeof WECHAT_TEMPLATES;

export const SubscribeAuthInput = z.object({
  templateId: z.enum([
    WECHAT_TEMPLATES.NEW_PHOTO_IN_FAMILY,
    WECHAT_TEMPLATES.PHOTO_FAVORITED,
    WECHAT_TEMPLATES.INVITE_ACCEPTED,
  ]),
  acceptedCount: z.number().int().min(1).max(5),
});
export type SubscribeAuthInput = z.infer<typeof SubscribeAuthInput>;
```

- [ ] **Step 4: Update `packages/shared/src/auth.ts` UserDTO**

Edit the `UserDTO` definition to add `hasWechatBound`:

```typescript
export const UserDTO = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarKey: z.string().nullable(),
  hasWechatBound: z.boolean(),
});
export type UserDTO = z.infer<typeof UserDTO>;
```

- [ ] **Step 5: Re-export from index**

Edit `packages/shared/src/index.ts`:

```typescript
export * from './auth.js';
export * from './collection.js';
export * from './photo.js';
export * from './tag.js';
export * from './wechat.js';
```

- [ ] **Step 6: Run test, verify PASS**

```bash
pnpm --filter @daynest/shared test
# or, if shared has no test script, run via api workspace
```

Expected: all 9 new tests pass.

- [ ] **Step 7: Run full api test suite — expect failures**

```bash
pnpm --filter @daynest/api test
```

Expected: SOME failures. Specifically: the existing `toUserDTO` function in `apps/api/src/routes/auth.ts` does NOT return `hasWechatBound`, so any test asserting against the UserDTO shape (e.g., `login.test.ts` GET /api/auth/me check) will surface a type or shape mismatch. **This is expected** — it'll be fixed in Task 4. Do NOT try to fix it in this task.

If failures are catastrophic (everything red), revert UserDTO change and consult; otherwise proceed.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/wechat.ts \
        packages/shared/src/index.ts \
        packages/shared/src/auth.ts \
        packages/shared/src/wechat.test.ts
git commit -m "feat(shared): add wechat schemas + UserDTO.hasWechatBound"
```

---

## Task 4: Update `toUserDTO` to expose `hasWechatBound`

**Files:**
- Modify: `apps/api/src/routes/auth.ts:13-29`

- [ ] **Step 1: Write failing test**

Edit `apps/api/tests/login.test.ts`. Add a new test case inside the existing `describe` block:

```typescript
  it('user DTO exposes hasWechatBound flag', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'mom', password: 'long-enough-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.hasWechatBound).toBe(false);
    await ctx.cleanup();
  });

  it('user DTO reflects wechat-bound user', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'dad',
        displayName: 'Dad',
        passwordHash: await hashPassword('long-enough-password'),
        wechatOpenId: 'openid-12345',
        wechatBoundAt: new Date(),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'dad', password: 'long-enough-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.hasWechatBound).toBe(true);
    await ctx.cleanup();
  });
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/login.test.ts
```

Expected: the 2 new cases fail (`expected undefined to be false/true`).

- [ ] **Step 3: Update `toUserDTO`**

Edit `apps/api/src/routes/auth.ts`. Change the `UserRecord` type and `toUserDTO`:

```typescript
type UserRecord = {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  wechatOpenId: string | null;
};

function toUserDTO(u: UserRecord) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarKey: u.avatarKey,
    hasWechatBound: Boolean(u.wechatOpenId),
  };
}
```

Prisma's default `User.findUnique` already returns `wechatOpenId` after Task 1, so no query changes are needed.

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/login.test.ts
```

Expected: all green.

- [ ] **Step 5: Run full api test suite**

```bash
pnpm --filter @daynest/api test
```

Expected: 100% green. (Any test that previously asserted on full UserDTO will now receive the new field — if old assertions used `toEqual` they may need `toMatchObject`. Fix any such test by widening the assertion or accepting the new field.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/tests/login.test.ts
git commit -m "feat(api): expose hasWechatBound on UserDTO"
```

---

## Task 5: BindToken JWT helper

**Files:**
- Create: `apps/api/src/auth/bindToken.ts`
- Create: `apps/api/tests/wechat/bindToken.test.ts`

- [ ] **Step 1: Write failing test**

Create directory `apps/api/tests/wechat/` and file `apps/api/tests/wechat/bindToken.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { signBindToken, verifyBindToken } from '../../src/auth/bindToken.js';
import { signAccess } from '../../src/auth/jwt.js';

const secret = 'b'.repeat(32);

describe('bindToken', () => {
  it('signs and verifies', async () => {
    const token = await signBindToken({ openid: 'openid-1' }, secret, 300);
    const claims = await verifyBindToken(token, secret);
    expect(claims.openid).toBe('openid-1');
  });

  it('rejects expired', async () => {
    const token = await signBindToken({ openid: 'openid-1' }, secret, -1);
    await expect(verifyBindToken(token, secret)).rejects.toBeTruthy();
  });

  it('rejects access token (wrong typ)', async () => {
    const access = await signAccess({ sub: 'user-1' }, secret, 60);
    await expect(verifyBindToken(access, secret)).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/bindToken.test.ts
```

Expected: cannot find module.

- [ ] **Step 3: Create `apps/api/src/auth/bindToken.ts`**

```typescript
import { SignJWT, jwtVerify } from 'jose';

const enc = new TextEncoder();

export type BindClaims = {
  openid: string;
  // 'typ' is set internally to 'bind' to prevent cross-type token misuse.
  // We deliberately do NOT carry session_key here — bind flow does not need
  // to encrypt anything from the WeChat session, only to prove the openid.
};

export async function signBindToken(
  claims: BindClaims,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return new SignJWT({ ...claims, typ: 'bind' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.openid)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(enc.encode(secret));
}

export async function verifyBindToken(
  token: string,
  secret: string
): Promise<BindClaims> {
  const { payload } = await jwtVerify(token, enc.encode(secret));
  if (payload.typ !== 'bind') throw new Error('wrong-token-type');
  if (typeof payload.openid !== 'string') throw new Error('missing-openid');
  return { openid: payload.openid };
}
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/bindToken.test.ts
```

Expected: 3 passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/bindToken.ts apps/api/tests/wechat/bindToken.test.ts
git commit -m "feat(api): add bindToken JWT helper for wechat bind flow"
```

---

## Task 6: WechatClient interface + types + FakeWechatClient

**Files:**
- Create: `apps/api/src/wechat/types.ts`
- Create: `apps/api/src/wechat/client.ts`
- Create: `apps/api/tests/helpers/wechat.fake.ts`

- [ ] **Step 1: Create `apps/api/src/wechat/types.ts`**

```typescript
export type JsCode2SessionResult = {
  openid: string;
  sessionKey: string;
  unionid?: string;
};

export type SendSubscribeOptions = {
  openid: string;
  templateId: string;
  page?: string;
  data: Record<string, { value: string }>;
};

export class WechatApiError extends Error {
  constructor(public errcode: number, public errmsg: string) {
    super(`wechat ${errcode}: ${errmsg}`);
    this.name = 'WechatApiError';
  }
}
```

- [ ] **Step 2: Create `apps/api/src/wechat/client.ts` with interface + class skeleton**

```typescript
import type { JsCode2SessionResult, SendSubscribeOptions } from './types.js';

export interface WechatClient {
  jsCode2Session(code: string): Promise<JsCode2SessionResult>;
  getAccessToken(): Promise<string>;
  sendSubscribe(opts: SendSubscribeOptions): Promise<void>;
}

// Real implementation is provided in Task 7. This file declares the contract
// so route code can be written against it and tests can inject a fake.
export class RealWechatClient implements WechatClient {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly accessTokenProvider: () => Promise<string>
  ) {}

  async jsCode2Session(_code: string): Promise<JsCode2SessionResult> {
    throw new Error('not-yet-implemented');
  }
  async getAccessToken(): Promise<string> {
    return this.accessTokenProvider();
  }
  async sendSubscribe(_opts: SendSubscribeOptions): Promise<void> {
    throw new Error('not-yet-implemented');
  }
}
```

(Real fetch logic comes in Task 7.)

- [ ] **Step 3: Create `apps/api/tests/helpers/wechat.fake.ts`**

```typescript
import type {
  WechatClient,
  JsCode2SessionResult,
  SendSubscribeOptions,
} from '../../src/wechat/client.js';

export class FakeWechatClient implements WechatClient {
  // Test hooks: tests can pre-populate these maps to control behavior.
  public codeToOpenid = new Map<string, string>();
  public sentSubscribes: SendSubscribeOptions[] = [];
  public accessTokenValue = 'fake-access-token';

  // Default: any code resolves to "openid-default" unless overridden.
  async jsCode2Session(code: string): Promise<JsCode2SessionResult> {
    const openid = this.codeToOpenid.get(code) ?? `openid-for-${code}`;
    return { openid, sessionKey: `session-key-for-${code}` };
  }

  async getAccessToken(): Promise<string> {
    return this.accessTokenValue;
  }

  async sendSubscribe(opts: SendSubscribeOptions): Promise<void> {
    this.sentSubscribes.push(opts);
  }
}
```

Note the import re-exports `JsCode2SessionResult` and `SendSubscribeOptions` through `client.ts`; if your tsconfig doesn't allow this re-shape, import them directly from `'../../src/wechat/types.js'` instead.

- [ ] **Step 4: Re-export types through client.ts for ergonomics**

Add to top of `apps/api/src/wechat/client.ts`:

```typescript
export type { JsCode2SessionResult, SendSubscribeOptions } from './types.js';
export { WechatApiError } from './types.js';
```

- [ ] **Step 5: Verify typecheck still passes**

```bash
pnpm --filter @daynest/api build
```

Expected: tsc reports no errors (the stub methods throw but compile fine).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/wechat/types.ts \
        apps/api/src/wechat/client.ts \
        apps/api/tests/helpers/wechat.fake.ts
git commit -m "feat(api): WechatClient interface + FakeWechatClient for tests"
```

---

## Task 7: Access token cache + RealWechatClient impl

**Files:**
- Create: `apps/api/src/wechat/accessTokenCache.ts`
- Create: `apps/api/tests/wechat/accessTokenCache.test.ts`
- Create: `apps/api/tests/wechat/client.test.ts`
- Modify: `apps/api/src/wechat/client.ts`

- [ ] **Step 1: Write failing test for accessTokenCache**

Create `apps/api/tests/wechat/accessTokenCache.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccessTokenCache } from '../../src/wechat/accessTokenCache.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wx-token-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('accessTokenCache', () => {
  it('calls fetcher on first get', async () => {
    const fetcher = vi.fn().mockResolvedValue({ token: 'tok1', expiresIn: 7200 });
    const cache = createAccessTokenCache({ filePath: join(dir, 'wx.json'), fetcher });
    expect(await cache.get()).toBe('tok1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns cached value without re-fetch when valid', async () => {
    const fetcher = vi.fn().mockResolvedValue({ token: 'tok1', expiresIn: 7200 });
    const cache = createAccessTokenCache({ filePath: join(dir, 'wx.json'), fetcher });
    await cache.get();
    await cache.get();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refreshes when token expires within 5 minutes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ token: 'tok1', expiresIn: 60 }) // 60s, well within 5min refresh window
      .mockResolvedValueOnce({ token: 'tok2', expiresIn: 7200 });
    const cache = createAccessTokenCache({ filePath: join(dir, 'wx.json'), fetcher });
    expect(await cache.get()).toBe('tok1');
    expect(await cache.get()).toBe('tok2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('persists to file', async () => {
    const filePath = join(dir, 'wx.json');
    const fetcher = vi.fn().mockResolvedValue({ token: 'tok-x', expiresIn: 7200 });
    const cache = createAccessTokenCache({ filePath, fetcher });
    await cache.get();
    expect(existsSync(filePath)).toBe(true);
  });

  it('loads from existing file on construction', async () => {
    const filePath = join(dir, 'wx.json');
    const expiresAt = Date.now() + 7200_000;
    writeFileSync(
      filePath,
      JSON.stringify({ token: 'persisted-tok', expiresAt })
    );
    const fetcher = vi.fn().mockResolvedValue({ token: 'fresh-tok', expiresIn: 7200 });
    const cache = createAccessTokenCache({ filePath, fetcher });
    expect(await cache.get()).toBe('persisted-tok');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('works without persistence (no filePath)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ token: 'mem-tok', expiresIn: 7200 });
    const cache = createAccessTokenCache({ fetcher });
    expect(await cache.get()).toBe('mem-tok');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/accessTokenCache.test.ts
```

Expected: cannot find module.

- [ ] **Step 3: Create `apps/api/src/wechat/accessTokenCache.ts`**

```typescript
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh if < 5 min until expiry

export type AccessTokenFetcher = () => Promise<{
  token: string;
  expiresIn: number; // seconds, per WeChat 'expires_in' field
}>;

export type AccessTokenCache = { get(): Promise<string> };

type State = { token: string; expiresAt: number } | null;

export function createAccessTokenCache(opts: {
  filePath?: string;
  fetcher: AccessTokenFetcher;
}): AccessTokenCache {
  let state: State = null;
  let inflight: Promise<string> | null = null;

  // Load from file on construction if present and not stale.
  if (opts.filePath && existsSync(opts.filePath)) {
    try {
      const raw = JSON.parse(readFileSync(opts.filePath, 'utf-8'));
      if (
        typeof raw.token === 'string' &&
        typeof raw.expiresAt === 'number' &&
        raw.expiresAt - Date.now() > REFRESH_BUFFER_MS
      ) {
        state = { token: raw.token, expiresAt: raw.expiresAt };
      }
    } catch {
      // ignore corrupt cache file
    }
  }

  async function refresh(): Promise<string> {
    const { token, expiresIn } = await opts.fetcher();
    const expiresAt = Date.now() + expiresIn * 1000;
    state = { token, expiresAt };
    if (opts.filePath) {
      try {
        writeFileSync(opts.filePath, JSON.stringify({ token, expiresAt }));
      } catch {
        // best-effort: silent fail keeps logic working in read-only environments
      }
    }
    return token;
  }

  return {
    async get(): Promise<string> {
      if (state && state.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
        return state.token;
      }
      if (!inflight) {
        inflight = refresh().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
  };
}
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/accessTokenCache.test.ts
```

Expected: 6 passes.

- [ ] **Step 5: Write client.test.ts for jsCode2Session and getAccessToken**

Create `apps/api/tests/wechat/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealWechatClient, WechatApiError } from '../../src/wechat/client.js';

const origFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = origFetch;
});

describe('RealWechatClient.jsCode2Session', () => {
  it('parses successful response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        openid: 'oXXXXXX',
        session_key: 'session-key-XYZ',
        unionid: 'uXXXXXX',
      }),
    });
    const client = new RealWechatClient('wxapp', 'secret', async () => 'tok');
    const out = await client.jsCode2Session('valid-code');
    expect(out).toEqual({
      openid: 'oXXXXXX',
      sessionKey: 'session-key-XYZ',
      unionid: 'uXXXXXX',
    });
  });

  it('throws WechatApiError when response has errcode', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errcode: 40029, errmsg: 'invalid code' }),
    });
    const client = new RealWechatClient('wxapp', 'secret', async () => 'tok');
    await expect(client.jsCode2Session('bad-code')).rejects.toBeInstanceOf(
      WechatApiError
    );
  });

  it('builds correct URL with code/appid/secret', async () => {
    let capturedUrl = '';
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({ openid: 'o1', session_key: 'sk' }),
      });
    });
    const client = new RealWechatClient('wxapp', 'secret', async () => 'tok');
    await client.jsCode2Session('thecode');
    expect(capturedUrl).toContain('appid=wxapp');
    expect(capturedUrl).toContain('secret=secret');
    expect(capturedUrl).toContain('js_code=thecode');
    expect(capturedUrl).toContain('grant_type=authorization_code');
  });
});
```

- [ ] **Step 6: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/client.test.ts
```

Expected: 3 failures with `not-yet-implemented`.

- [ ] **Step 7: Implement jsCode2Session in `client.ts`**

Replace the existing stub in `apps/api/src/wechat/client.ts`. The full file:

```typescript
import type { JsCode2SessionResult, SendSubscribeOptions } from './types.js';
import { WechatApiError } from './types.js';

export type { JsCode2SessionResult, SendSubscribeOptions } from './types.js';
export { WechatApiError } from './types.js';

export interface WechatClient {
  jsCode2Session(code: string): Promise<JsCode2SessionResult>;
  getAccessToken(): Promise<string>;
  sendSubscribe(opts: SendSubscribeOptions): Promise<void>;
}

export class RealWechatClient implements WechatClient {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly accessTokenProvider: () => Promise<string>
  ) {}

  async jsCode2Session(code: string): Promise<JsCode2SessionResult> {
    const params = new URLSearchParams({
      appid: this.appId,
      secret: this.appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    });
    const url = `https://api.weixin.qq.com/sns/jscode2session?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new WechatApiError(-1, `http ${res.status}`);
    }
    const body = (await res.json()) as {
      openid?: string;
      session_key?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (body.errcode && body.errcode !== 0) {
      throw new WechatApiError(body.errcode, body.errmsg ?? 'unknown');
    }
    if (!body.openid || !body.session_key) {
      throw new WechatApiError(-1, 'missing openid/session_key in response');
    }
    return {
      openid: body.openid,
      sessionKey: body.session_key,
      unionid: body.unionid,
    };
  }

  async getAccessToken(): Promise<string> {
    return this.accessTokenProvider();
  }

  async sendSubscribe(_opts: SendSubscribeOptions): Promise<void> {
    // Implemented in Plan 02 (subscribe messages). This stub allows route code
    // to compile and intentionally throws to surface accidental usage in v1.
    throw new Error('sendSubscribe is implemented in Plan 02');
  }
}
```

- [ ] **Step 8: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/
```

Expected: all 9 tests pass (3 bindToken + 6 accessTokenCache + 3 client = 12 — recount, but all green).

Actually counting: 3 bindToken + 6 accessTokenCache + 3 client = 12. Verify the output.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/wechat/client.ts \
        apps/api/src/wechat/accessTokenCache.ts \
        apps/api/tests/wechat/accessTokenCache.test.ts \
        apps/api/tests/wechat/client.test.ts
git commit -m "feat(api): jsCode2Session + access_token cache (file-backed)"
```

---

## Task 8: Inject WechatClient into AppDeps + buildApp helper

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/tests/helpers/buildApp.ts`

- [ ] **Step 1: Add WechatClient to AppDeps**

Edit `apps/api/src/server.ts`. Update the top imports:

```typescript
import type { WechatClient } from './wechat/client.js';
```

Update `AppDeps`:

```typescript
export type AppDeps = {
  config: AppConfig;
  storage: StorageProvider;
  prisma: PrismaClient;
  wechat: WechatClient;
};
```

- [ ] **Step 2: Update buildApp helper to inject FakeWechatClient**

Edit `apps/api/tests/helpers/buildApp.ts`:

```typescript
import { buildServer } from '../../src/server.js';
import { FakeStorage } from './storage.fake.js';
import { FakeWechatClient } from './wechat.fake.js';
import { resetTestDb } from './db.js';
import { getPrisma } from '../../src/db.js';
import { loadConfig } from '../../src/config.js';

export async function buildApp() {
  await resetTestDb();
  const config = loadConfig();
  const storage = new FakeStorage();
  const wechat = new FakeWechatClient();
  const prisma = getPrisma();
  const app = await buildServer(
    { logger: false },
    { config, storage, prisma, wechat }
  );
  return {
    app,
    storage,
    wechat,
    prisma,
    config,
    cleanup: async () => {
      await app.close();
    },
  };
}
```

- [ ] **Step 3: Verify typecheck + run full suite**

```bash
pnpm --filter @daynest/api build
pnpm --filter @daynest/api test
```

Expected: typecheck passes (every dep with `AppDeps` is now satisfied), all existing tests still green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/server.ts apps/api/tests/helpers/buildApp.ts
git commit -m "feat(api): wire WechatClient into AppDeps + tests"
```

---

## Task 9: `POST /api/auth/wechat-login` route

**Files:**
- Create: `apps/api/src/routes/wechat.ts` (new file holding all wechat-* routes)
- Modify: `apps/api/src/server.ts` (register the new routes file)
- Create: `apps/api/tests/wechat/login.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/wechat/login.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';

describe('POST /api/auth/wechat-login', () => {
  it('returns bound=true with tokens for already-bound user', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
        wechatOpenId: 'openid-mom',
        wechatBoundAt: new Date(),
      },
    });
    ctx.wechat.codeToOpenid.set('code-mom', 'openid-mom');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'code-mom-padded-to-min-length' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bound).toBe(true);
    expect(body.user.username).toBe('mom');
    expect(body.user.hasWechatBound).toBe(true);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    await ctx.cleanup();
  });

  it('returns bound=false with bindToken for unknown openid', async () => {
    const ctx = await buildApp();
    ctx.wechat.codeToOpenid.set('code-newperson', 'openid-newperson');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'code-newperson-padded' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bound).toBe(false);
    expect(body.bindToken).toBeTruthy();
    expect(body.user).toBeUndefined();
    await ctx.cleanup();
  });

  it('rejects validation when code too short', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'short' },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('returns 503 when wechat is not configured', async () => {
    // This test asserts the route correctly probes config.wechat.enabled.
    // We achieve this by temporarily mutating config on the running app.
    const ctx = await buildApp();
    ctx.config.wechat.enabled = false;
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'any-valid-length-code' },
    });
    expect(res.statusCode).toBe(503);
    ctx.config.wechat.enabled = true;
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/login.test.ts
```

Expected: 4 failures (404 not found on the route).

- [ ] **Step 3: Create `apps/api/src/routes/wechat.ts`**

```typescript
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  WechatLoginInput,
  type WechatLoginResponse,
} from '@daynest/shared';
import { signAccess, signRefresh } from '../auth/jwt.js';
import { signBindToken } from '../auth/bindToken.js';
import { AppError } from '../lib/errors.js';
import { WechatApiError } from '../wechat/client.js';

type UserRecord = {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  wechatOpenId: string | null;
};

function toUserDTO(u: UserRecord) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarKey: u.avatarKey,
    hasWechatBound: Boolean(u.wechatOpenId),
  };
}

async function issueTokens(app: FastifyInstance, user: UserRecord) {
  const access = await signAccess(
    { sub: user.id },
    app.deps.config.jwt.secret,
    app.deps.config.jwt.accessTtl
  );
  const refresh = await signRefresh(
    { sub: user.id },
    app.deps.config.jwt.refreshSecret,
    app.deps.config.jwt.refreshTtl
  );
  return { accessToken: access, refreshToken: refresh };
}

function ensureWechatEnabled(app: FastifyInstance, reply: FastifyReply) {
  if (!app.deps.config.wechat.enabled) {
    reply.status(503).send({
      code: 'WECHAT_DISABLED',
      message: 'wechat integration not configured on this server',
    });
    return false;
  }
  return true;
}

const BIND_TOKEN_TTL = 5 * 60; // 5 minutes

export async function registerWechatRoutes(app: FastifyInstance) {
  app.post('/api/auth/wechat-login', async (req, reply): Promise<WechatLoginResponse | undefined> => {
    if (!ensureWechatEnabled(app, reply)) return;
    const parsed = WechatLoginInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'invalid code');
    }

    let session;
    try {
      session = await app.deps.wechat.jsCode2Session(parsed.data.code);
    } catch (e) {
      if (e instanceof WechatApiError) {
        throw new AppError(401, 'WECHAT_CODE_INVALID', e.errmsg);
      }
      throw new AppError(502, 'WECHAT_UPSTREAM_ERROR', 'wechat call failed');
    }

    const user = await app.deps.prisma.user.findUnique({
      where: { wechatOpenId: session.openid },
    });

    if (user) {
      const tokens = await issueTokens(app, user);
      return { bound: true, user: toUserDTO(user), ...tokens };
    }

    // Unbound openid → issue short-lived bindToken so the client can finish
    // binding in a follow-up call with daynest credentials.
    const bindToken = await signBindToken(
      { openid: session.openid },
      app.deps.config.jwt.secret,
      BIND_TOKEN_TTL
    );
    return { bound: false, bindToken };
  });
}
```

- [ ] **Step 4: Register the routes in `server.ts`**

Edit `apps/api/src/server.ts`. Add the import:

```typescript
import { registerWechatRoutes } from './routes/wechat.js';
```

Inside `buildServer`, after `await registerFavoritesRoutes(app);`:

```typescript
    await registerWechatRoutes(app);
```

- [ ] **Step 5: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/login.test.ts
```

Expected: 4 passes.

- [ ] **Step 6: Run full api test suite**

```bash
pnpm --filter @daynest/api test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/wechat.ts \
        apps/api/src/server.ts \
        apps/api/tests/wechat/login.test.ts
git commit -m "feat(api): POST /api/auth/wechat-login (bound + unbound flows)"
```

---

## Task 10: `POST /api/auth/wechat-bind` route

**Files:**
- Modify: `apps/api/src/routes/wechat.ts`
- Create: `apps/api/tests/wechat/bind.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/wechat/bind.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signBindToken } from '../../src/auth/bindToken.js';
import { loadConfig } from '../../src/config.js';

const cfg = loadConfig();

async function makeBindToken(openid: string, ttl = 300) {
  return signBindToken({ openid }, cfg.jwt.secret, ttl);
}

describe('POST /api/auth/wechat-bind', () => {
  it('binds and returns tokens on valid credentials', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const bindToken = await makeBindToken('openid-mom');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken, username: 'mom', password: 'long-enough-password' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe('mom');
    expect(body.user.hasWechatBound).toBe(true);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const stored = await ctx.prisma.user.findUnique({ where: { username: 'mom' } });
    expect(stored?.wechatOpenId).toBe('openid-mom');
    expect(stored?.wechatBoundAt).toBeTruthy();
    await ctx.cleanup();
  });

  it('rejects expired bindToken', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const bindToken = await makeBindToken('openid-mom', -1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken, username: 'mom', password: 'long-enough-password' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('BIND_TOKEN_EXPIRED');
    await ctx.cleanup();
  });

  it('rejects malformed bindToken', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken: 'not-a-jwt', username: 'mom', password: 'pwd-long' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('BIND_TOKEN_INVALID');
    await ctx.cleanup();
  });

  it('rejects wrong daynest password', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('correct-password'),
      },
    });
    const bindToken = await makeBindToken('openid-mom');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken, username: 'mom', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('BAD_CREDENTIALS');
    await ctx.cleanup();
  });

  it('rejects unknown username', async () => {
    const ctx = await buildApp();
    const bindToken = await makeBindToken('openid-x');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken, username: 'ghost', password: 'pwd-long-enough' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('BAD_CREDENTIALS');
    await ctx.cleanup();
  });

  it('rejects daynest user already bound to a different openid', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
        wechatOpenId: 'openid-existing',
        wechatBoundAt: new Date(),
      },
    });
    const bindToken = await makeBindToken('openid-new');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken, username: 'mom', password: 'long-enough-password' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('ALREADY_BOUND');
    await ctx.cleanup();
  });

  it('rejects when openid already belongs to a different user', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'dad',
        displayName: 'Dad',
        passwordHash: await hashPassword('long-enough-password'),
        wechatOpenId: 'openid-shared',
        wechatBoundAt: new Date(),
      },
    });
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const bindToken = await makeBindToken('openid-shared');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-bind',
      payload: { bindToken, username: 'mom', password: 'long-enough-password' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('OPENID_TAKEN');
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/bind.test.ts
```

Expected: 7 failures.

- [ ] **Step 3: Add bind route to `wechat.ts`**

Edit `apps/api/src/routes/wechat.ts`. Add imports near the top:

```typescript
import { WechatBindInput, type WechatBindResponse } from '@daynest/shared';
import { verifyBindToken } from '../auth/bindToken.js';
import { verifyPassword } from '../auth/password.js';
```

Inside `registerWechatRoutes`, after the wechat-login handler:

```typescript
  app.post('/api/auth/wechat-bind', async (req, reply): Promise<WechatBindResponse | undefined> => {
    if (!ensureWechatEnabled(app, reply)) return;
    const parsed = WechatBindInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'invalid bind input');
    }
    const { bindToken, username, password } = parsed.data;

    // Verify bindToken first — its expiry is the most common failure path.
    let openid: string;
    try {
      const claims = await verifyBindToken(bindToken, app.deps.config.jwt.secret);
      openid = claims.openid;
    } catch (e) {
      const msg = (e as Error).message;
      // jose throws 'JWTExpired' for expired tokens; everything else is malformed.
      const expired = msg.includes('exp') || msg.includes('expired');
      throw new AppError(
        401,
        expired ? 'BIND_TOKEN_EXPIRED' : 'BIND_TOKEN_INVALID',
        msg
      );
    }

    const user = await app.deps.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new AppError(401, 'BAD_CREDENTIALS', 'invalid username or password');
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      throw new AppError(401, 'BAD_CREDENTIALS', 'invalid username or password');
    }

    if (user.wechatOpenId && user.wechatOpenId !== openid) {
      throw new AppError(
        409,
        'ALREADY_BOUND',
        'this daynest account is already bound to a different wechat'
      );
    }

    const otherWithSameOpenid = await app.deps.prisma.user.findUnique({
      where: { wechatOpenId: openid },
    });
    if (otherWithSameOpenid && otherWithSameOpenid.id !== user.id) {
      throw new AppError(
        409,
        'OPENID_TAKEN',
        'this wechat is already bound to a different daynest account'
      );
    }

    const updated = await app.deps.prisma.user.update({
      where: { id: user.id },
      data: { wechatOpenId: openid, wechatBoundAt: new Date() },
    });
    const tokens = await issueTokens(app, updated);
    return { user: toUserDTO(updated), ...tokens };
  });
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/bind.test.ts
```

Expected: 7 passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/wechat.ts apps/api/tests/wechat/bind.test.ts
git commit -m "feat(api): POST /api/auth/wechat-bind with all error codes"
```

---

## Task 11: `POST /api/auth/wechat-register` route

**Files:**
- Modify: `apps/api/src/routes/wechat.ts`
- Create: `apps/api/tests/wechat/register.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/wechat/register.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { signBindToken } from '../../src/auth/bindToken.js';
import { createInvite } from '../../src/services/invites.js';
import { hashPassword } from '../../src/auth/password.js';
import { loadConfig } from '../../src/config.js';

const cfg = loadConfig();

describe('POST /api/auth/wechat-register', () => {
  async function setupInviter(ctx: Awaited<ReturnType<typeof buildApp>>) {
    const inviter = await ctx.prisma.user.create({
      data: {
        username: 'dad',
        displayName: 'Dad',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const invite = await createInvite(ctx.prisma, inviter.id, 24);
    return invite.token;
  }

  it('creates new user, binds openid, returns tokens', async () => {
    const ctx = await buildApp();
    const inviteToken = await setupInviter(ctx);
    const bindToken = await signBindToken({ openid: 'openid-aunt' }, cfg.jwt.secret, 300);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken,
        inviteToken,
        username: 'aunt',
        displayName: 'Aunt',
        password: 'long-enough-password',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe('aunt');
    expect(body.user.hasWechatBound).toBe(true);
    expect(body.accessToken).toBeTruthy();

    const created = await ctx.prisma.user.findUnique({ where: { username: 'aunt' } });
    expect(created?.wechatOpenId).toBe('openid-aunt');
    await ctx.cleanup();
  });

  it('rejects expired bindToken', async () => {
    const ctx = await buildApp();
    const inviteToken = await setupInviter(ctx);
    const bindToken = await signBindToken({ openid: 'openid-x' }, cfg.jwt.secret, -1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken,
        inviteToken,
        username: 'aunt',
        displayName: 'Aunt',
        password: 'long-enough-password',
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('BIND_TOKEN_EXPIRED');
    await ctx.cleanup();
  });

  it('rejects invalid invite token', async () => {
    const ctx = await buildApp();
    const bindToken = await signBindToken({ openid: 'openid-x' }, cfg.jwt.secret, 300);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken,
        inviteToken: 'invalid-invite-token',
        username: 'aunt',
        displayName: 'Aunt',
        password: 'long-enough-password',
      },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('rejects when openid already bound', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'existing',
        displayName: 'Existing',
        passwordHash: await hashPassword('long-enough-password'),
        wechatOpenId: 'openid-conflict',
        wechatBoundAt: new Date(),
      },
    });
    const inviteToken = await setupInviter(ctx);
    const bindToken = await signBindToken({ openid: 'openid-conflict' }, cfg.jwt.secret, 300);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken,
        inviteToken,
        username: 'aunt',
        displayName: 'Aunt',
        password: 'long-enough-password',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('OPENID_TAKEN');
    await ctx.cleanup();
  });

  it('rejects username already taken', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'aunt',
        displayName: 'Other Aunt',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const inviteToken = await setupInviter(ctx);
    const bindToken = await signBindToken({ openid: 'openid-x' }, cfg.jwt.secret, 300);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken,
        inviteToken,
        username: 'aunt',
        displayName: 'Aunt',
        password: 'long-enough-password',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('USERNAME_TAKEN');
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/register.test.ts
```

Expected: 5 failures (404).

- [ ] **Step 3: Add register route to `wechat.ts`**

Add import in `apps/api/src/routes/wechat.ts`:

```typescript
import { WechatRegisterInput } from '@daynest/shared';
import { hashPassword } from '../auth/password.js';
import { consumeInvite } from '../services/invites.js';
```

Add handler inside `registerWechatRoutes`, after the wechat-bind handler:

```typescript
  app.post('/api/auth/wechat-register', async (req, reply) => {
    if (!ensureWechatEnabled(app, reply)) return;
    const parsed = WechatRegisterInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; ')
      );
    }
    const { bindToken, inviteToken, username, displayName, password } = parsed.data;

    let openid: string;
    try {
      const claims = await verifyBindToken(bindToken, app.deps.config.jwt.secret);
      openid = claims.openid;
    } catch (e) {
      const msg = (e as Error).message;
      const expired = msg.includes('exp') || msg.includes('expired');
      throw new AppError(
        401,
        expired ? 'BIND_TOKEN_EXPIRED' : 'BIND_TOKEN_INVALID',
        msg
      );
    }

    const collidingOpenid = await app.deps.prisma.user.findUnique({
      where: { wechatOpenId: openid },
    });
    if (collidingOpenid) {
      throw new AppError(409, 'OPENID_TAKEN', 'wechat already bound');
    }

    const existingUsername = await app.deps.prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      throw new AppError(400, 'USERNAME_TAKEN', 'username already in use');
    }

    try {
      await consumeInvite(app.deps.prisma, inviteToken);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'INVALID_INVITE';
      throw new AppError(400, code, 'invite token invalid or expired');
    }

    const passwordHash = await hashPassword(password);
    const user = await app.deps.prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash,
        wechatOpenId: openid,
        wechatBoundAt: new Date(),
      },
    });
    const tokens = await issueTokens(app, user);
    return { user: toUserDTO(user), ...tokens };
  });
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/register.test.ts
```

Expected: 5 passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/wechat.ts apps/api/tests/wechat/register.test.ts
git commit -m "feat(api): POST /api/auth/wechat-register (invite-driven)"
```

---

## Task 12: `POST /api/auth/wechat-unbind` route

**Files:**
- Modify: `apps/api/src/routes/wechat.ts`
- Create: `apps/api/tests/wechat/unbind.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/wechat/unbind.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';

async function loginAs(ctx: Awaited<ReturnType<typeof buildApp>>, username: string, password: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  return res.json().accessToken as string;
}

describe('POST /api/auth/wechat-unbind', () => {
  it('clears openid for authenticated user', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
        wechatOpenId: 'openid-mom',
        wechatBoundAt: new Date(),
      },
    });
    const token = await loginAs(ctx, 'mom', 'long-enough-password');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.hasWechatBound).toBe(false);

    const stored = await ctx.prisma.user.findUnique({ where: { username: 'mom' } });
    expect(stored?.wechatOpenId).toBeNull();
    expect(stored?.wechatBoundAt).toBeNull();
    await ctx.cleanup();
  });

  it('rejects without auth', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('is idempotent (no-op when already unbound)', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const token = await loginAs(ctx, 'mom', 'long-enough-password');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.hasWechatBound).toBe(false);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/unbind.test.ts
```

Expected: 3 failures.

- [ ] **Step 3: Add unbind route to `wechat.ts`**

Inside `registerWechatRoutes`, after wechat-register:

```typescript
  app.post(
    '/api/auth/wechat-unbind',
    { onRequest: [app.requireUser] },
    async (req) => {
      const updated = await app.deps.prisma.user.update({
        where: { id: req.user.id },
        data: { wechatOpenId: null, wechatBoundAt: null },
      });
      return { user: toUserDTO(updated) };
    }
  );
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/unbind.test.ts
```

Expected: 3 passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/wechat.ts apps/api/tests/wechat/unbind.test.ts
git commit -m "feat(api): POST /api/auth/wechat-unbind"
```

---

## Task 13: `POST /api/auth/refresh-token` (body-mode refresh)

**Files:**
- Modify: `apps/api/src/routes/auth.ts` (add the new route alongside existing cookie refresh)
- Create: `apps/api/tests/wechat/refreshToken.test.ts`

> Body-mode refresh is logically in the `auth.ts` route file because it doesn't depend on WeChat. We register it in `auth.ts` to keep both refresh paths (cookie + body) side by side.

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/wechat/refreshToken.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signRefresh } from '../../src/auth/jwt.js';
import { loadConfig } from '../../src/config.js';

const cfg = loadConfig();

describe('POST /api/auth/refresh-token', () => {
  it('returns new tokens with valid refresh token in body', async () => {
    const ctx = await buildApp();
    const user = await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const refresh = await signRefresh({ sub: user.id }, cfg.jwt.refreshSecret, 60);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: refresh },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe('mom');
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    await ctx.cleanup();
  });

  it('rejects missing refresh token', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('rejects invalid/expired token', async () => {
    const ctx = await buildApp();
    const expired = await signRefresh({ sub: 'user-x' }, cfg.jwt.refreshSecret, -1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: expired },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('rejects access token used as refresh (wrong typ)', async () => {
    const ctx = await buildApp();
    const user = await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const { signAccess } = await import('../../src/auth/jwt.js');
    const access = await signAccess({ sub: user.id }, cfg.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: access },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('rejects when user has been deleted', async () => {
    const ctx = await buildApp();
    const refresh = await signRefresh(
      { sub: '00000000-0000-0000-0000-000000000000' },
      cfg.jwt.refreshSecret,
      60
    );
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: refresh },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/refreshToken.test.ts
```

Expected: 5 failures.

- [ ] **Step 3: Add body-mode refresh in `apps/api/src/routes/auth.ts`**

Edit `apps/api/src/routes/auth.ts`. Update the `toUserDTO` to include `hasWechatBound` (done in Task 4 already — verify the function looks like the Task 4 result; if not, update it now). Also update `UserRecord` type if not done.

Add new imports near top:

```typescript
import { RefreshTokenInput } from '@daynest/shared';
```

Add new handler inside `registerAuthRoutes`, after the existing `/api/auth/refresh` handler:

```typescript
  // Body-mode refresh — used by mini-program (no HttpOnly cookies on wx.request).
  // The existing cookie-based /api/auth/refresh is kept for the web client.
  app.post('/api/auth/refresh-token', async (req) => {
    const parsed = RefreshTokenInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'missing refreshToken in body');
    }
    let claims;
    try {
      claims = await verifyRefresh(parsed.data.refreshToken, app.deps.config.jwt.refreshSecret);
    } catch {
      throw new AppError(401, 'BAD_REFRESH', 'invalid refresh');
    }
    const user = await app.deps.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user) throw new AppError(401, 'USER_GONE', 'user not found');

    const accessToken = await signAccess(
      { sub: user.id },
      app.deps.config.jwt.secret,
      app.deps.config.jwt.accessTtl
    );
    const refreshToken = await signRefresh(
      { sub: user.id },
      app.deps.config.jwt.refreshSecret,
      app.deps.config.jwt.refreshTtl
    );
    return { user: toUserDTO(user), accessToken, refreshToken };
  });
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/refreshToken.test.ts
```

Expected: 5 passes.

- [ ] **Step 5: Run full api test suite**

```bash
pnpm --filter @daynest/api test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/tests/wechat/refreshToken.test.ts
git commit -m "feat(api): POST /api/auth/refresh-token (body-mode for miniapp)"
```

---

## Task 14: `POST /api/wechat/subscribe` route

**Files:**
- Modify: `apps/api/src/routes/wechat.ts`
- Create: `apps/api/tests/wechat/subscribe.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/tests/wechat/subscribe.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';

async function loginAs(ctx: Awaited<ReturnType<typeof buildApp>>, username: string, password: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  return res.json().accessToken as string;
}

describe('POST /api/wechat/subscribe', () => {
  it('upserts subscription and increments quota', async () => {
    const ctx = await buildApp();
    const user = await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const token = await loginAs(ctx, 'mom', 'long-enough-password');

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { templateId: 'PHOTO_FAVORITED', acceptedCount: 1 },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().quota).toBe(1);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { templateId: 'PHOTO_FAVORITED', acceptedCount: 2 },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().quota).toBe(3);

    const row = await ctx.prisma.wechatSubscription.findUnique({
      where: { userId_templateId: { userId: user.id, templateId: 'PHOTO_FAVORITED' } },
    });
    expect(row?.quota).toBe(3);
    await ctx.cleanup();
  });

  it('handles multiple template ids separately', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const token = await loginAs(ctx, 'mom', 'long-enough-password');

    await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { templateId: 'PHOTO_FAVORITED', acceptedCount: 1 },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { templateId: 'INVITE_ACCEPTED', acceptedCount: 1 },
    });

    const rows = await ctx.prisma.wechatSubscription.findMany();
    expect(rows.length).toBe(2);
    await ctx.cleanup();
  });

  it('rejects unknown template id', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const token = await loginAs(ctx, 'mom', 'long-enough-password');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { templateId: 'BOGUS', acceptedCount: 1 },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('rejects acceptedCount > 5', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'mom',
        displayName: 'Mom',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const token = await loginAs(ctx, 'mom', 'long-enough-password');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${token}` },
      payload: { templateId: 'PHOTO_FAVORITED', acceptedCount: 99 },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('rejects without auth', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      payload: { templateId: 'PHOTO_FAVORITED', acceptedCount: 1 },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
pnpm --filter @daynest/api test -- tests/wechat/subscribe.test.ts
```

Expected: 5 failures.

- [ ] **Step 3: Add subscribe route to `wechat.ts`**

Add import:

```typescript
import { SubscribeAuthInput } from '@daynest/shared';
```

Add handler inside `registerWechatRoutes`, after wechat-unbind:

```typescript
  app.post(
    '/api/wechat/subscribe',
    { onRequest: [app.requireUser] },
    async (req) => {
      const parsed = SubscribeAuthInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'invalid subscribe input');
      }
      const { templateId, acceptedCount } = parsed.data;
      const updated = await app.deps.prisma.wechatSubscription.upsert({
        where: {
          userId_templateId: { userId: req.user.id, templateId },
        },
        create: {
          userId: req.user.id,
          templateId,
          quota: acceptedCount,
        },
        update: {
          quota: { increment: acceptedCount },
        },
      });
      return { templateId: updated.templateId, quota: updated.quota };
    }
  );
```

- [ ] **Step 4: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/subscribe.test.ts
```

Expected: 5 passes.

- [ ] **Step 5: Run full api test suite**

```bash
pnpm --filter @daynest/api test
```

Expected: ALL green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/wechat.ts apps/api/tests/wechat/subscribe.test.ts
git commit -m "feat(api): POST /api/wechat/subscribe (auth tracking + quota)"
```

---

## Task 15: Server integration test (smoke)

**Files:**
- Modify: `apps/api/tests/server.test.ts` (likely already exists — add to it)
- Or create: `apps/api/tests/wechat/smoke.test.ts`

- [ ] **Step 1: Inspect existing server.test.ts**

Read `apps/api/tests/server.test.ts` to understand the existing patterns. If it has health-check + route registration smoke tests, extend; else create a new smoke test file.

- [ ] **Step 2: Add full-flow smoke test**

Create `apps/api/tests/wechat/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { createInvite } from '../../src/services/invites.js';
import { hashPassword } from '../../src/auth/password.js';

describe('wechat end-to-end smoke', () => {
  it('runs unbound login → register → re-login → unbind → re-login (bound=false)', async () => {
    const ctx = await buildApp();
    const inviter = await ctx.prisma.user.create({
      data: {
        username: 'dad',
        displayName: 'Dad',
        passwordHash: await hashPassword('long-enough-password'),
      },
    });
    const invite = await createInvite(ctx.prisma, inviter.id, 24);

    // Step 1: first wechat-login with unknown openid → bound=false + bindToken
    ctx.wechat.codeToOpenid.set('code-aunt', 'openid-aunt');
    const login1 = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'code-aunt-padded' },
    });
    expect(login1.json().bound).toBe(false);
    const bindToken = login1.json().bindToken;

    // Step 2: register with bindToken + inviteToken
    const reg = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken,
        inviteToken: invite.token,
        username: 'aunt',
        displayName: 'Aunt',
        password: 'long-enough-password',
      },
    });
    expect(reg.statusCode).toBe(200);
    expect(reg.json().user.hasWechatBound).toBe(true);
    const accessToken = reg.json().accessToken;

    // Step 3: re-login with same code → bound=true
    const login2 = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'code-aunt-padded' },
    });
    expect(login2.json().bound).toBe(true);
    expect(login2.json().user.username).toBe('aunt');

    // Step 4: unbind
    const unbind = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(unbind.json().user.hasWechatBound).toBe(false);

    // Step 5: re-login → unbound again
    const login3 = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'code-aunt-padded' },
    });
    expect(login3.json().bound).toBe(false);

    await ctx.cleanup();
  });
});
```

- [ ] **Step 3: Run test, verify PASS**

```bash
pnpm --filter @daynest/api test -- tests/wechat/smoke.test.ts
```

Expected: 1 pass. This test verifies the entire 5-step flow stitches together correctly.

- [ ] **Step 4: Run full api test suite one more time**

```bash
pnpm --filter @daynest/api test
```

Expected: ALL green. Count: should be original count + ~30 new test cases.

- [ ] **Step 5: Run typecheck**

```bash
pnpm --filter @daynest/api build
```

Expected: tsc with no errors. (Build artifacts in `dist/` can be discarded after.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/tests/wechat/smoke.test.ts
git commit -m "test(api): wechat auth end-to-end smoke test"
```

---

## Self-Review Checklist

Run through this **after** the last commit before declaring the plan done.

### 1. Spec coverage

Map every requirement in [`../specs/2026-05-22-miniapp-design.md`](../specs/2026-05-22-miniapp-design.md) §6 (the API/schema contract) to a task in this plan:

- ✅ §6.1 Prisma schema diff → Task 1
- ✅ §6.2 Migration SQL → Task 1
- ✅ §6.3 Config WECHAT_APPID/SECRET → Task 2
- ✅ §6.4 `wechat/client.ts` + `accessTokenCache.ts` → Tasks 6, 7
- ✅ §6.5 Six routes:
  - wechat-login → Task 9
  - wechat-bind → Task 10
  - wechat-register → Task 11
  - wechat-unbind → Task 12
  - refresh-token → Task 13
  - wechat/subscribe → Task 14
- ✅ §6.7 packages/shared/wechat.ts + UserDTO.hasWechatBound → Tasks 3, 4
- ✅ §6.10 Test coverage → every task includes tests; Task 15 is end-to-end smoke

**Deferred (separate plans):**
- §6.6 業務事件触发订阅消息 → Plan 02 (`miniapp-02-backend-subscribe.md`)
- §6.4 `subscribe.ts` 发送实现 → Plan 02 (skeleton method `sendSubscribe` in Task 7 throws as a guard)

### 2. Placeholder scan

Search this plan for forbidden phrases:
- "TBD", "TODO", "fill in", "implement later" → none should appear
- "Add appropriate error handling" / "add validation" → not used
- "Write tests for the above" (without code) → every test step has full code
- "Similar to Task N" without repeating code → not used

### 3. Type / name consistency

Cross-check:
- `WechatClient.jsCode2Session` returns `JsCode2SessionResult { openid, sessionKey, unionid? }` — used consistently in routes (Tasks 9, 10, 11) as `session.openid`
- `signBindToken(claims, secret, ttlSeconds)` signature — called identically in Tasks 9, 10, 11, 15
- `BindClaims = { openid: string }` — Task 5 produces it, Task 10/11 consumes it
- Route error codes alphabet match between tests and impl:
  - `BIND_TOKEN_EXPIRED` ✓ (Task 10 test, Task 10 impl, Task 11 test, Task 11 impl)
  - `BIND_TOKEN_INVALID` ✓ (Task 10)
  - `ALREADY_BOUND` ✓ (Task 10)
  - `OPENID_TAKEN` ✓ (Tasks 10, 11)
  - `USERNAME_TAKEN` ✓ (Task 11)
  - `BAD_CREDENTIALS` ✓ (Task 10)
  - `BAD_REFRESH` / `USER_GONE` ✓ (Task 13)
  - `WECHAT_DISABLED` ✓ (Task 9)
  - `WECHAT_CODE_INVALID` / `WECHAT_UPSTREAM_ERROR` ✓ (Task 9)
- `WechatSubscription.upsert` uses `userId_templateId` composite key — matches the `@@unique([userId, templateId])` from Task 1 (Prisma will name the composite WHERE key `userId_templateId` automatically — verified by the test in Task 14)

If any inconsistency found later, fix it in the relevant task before proceeding.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-miniapp-01-backend-wechat-auth.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**

---

## Companion Plans (not yet written)

Once this plan is executed and merged, the next plans in the series can be written:

| # | Plan | Depends on | Brief |
|---|---|---|---|
| 02 | `miniapp-02-backend-subscribe.md` | 01 | Implement `WechatClient.sendSubscribe` + fire-and-forget triggers in `services/collections.ts`, `services/photos.ts`, `services/invites.ts` |
| 03 | `miniapp-03-scaffold.md` | 01 | `apps/miniapp/` bootstrap: `app.json`, `project.config.json`, `tsconfig`, custom tabBar, base styles, `wx.request` client wrapper with 401 refresh |
| 04 | `miniapp-04-design-system.md` | 03 | Font subsetting build chain, `packages/shared/design-tokens.ts`, polaroid WXSS components, dark mode |
| 05 | `miniapp-05-auth-pages.md` | 01 + 03 | Login / Bind / Register pages on the client |
| 06 | `miniapp-06-browse.md` | 04 + 05 | Timeline, favorites, tags overview, tag pinboard, collection detail, photo viewer |
| 07 | `miniapp-07-upload.md` | 06 | pick / meta / progress pages; exifr + compression; upload queue store |
| 08 | `miniapp-08-mgmt.md` | 06 | Settings, profile edit, tag rename, invite management |
| 09 | `miniapp-09-release.md` | All | `miniprogram-ci`, audit prep, QA checklist, deployment docs update |

—— end of plan 01
