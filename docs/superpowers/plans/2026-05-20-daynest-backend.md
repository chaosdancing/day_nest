# DayNest Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully-tested REST API + persistence + storage integration that backs the DayNest family memory site.

**Architecture:** Fastify HTTP server + Prisma ORM on SQLite + Qiniu Kodo as object storage. Auth via JWT (access in header, refresh in HttpOnly cookie). Direct-to-storage uploads via short-lived Qiniu tokens. All endpoints are validated via zod schemas shared with the frontend through a `packages/shared` package.

**Tech Stack:** Node.js 20, TypeScript, Fastify 4, Prisma 5, SQLite, argon2, jose, qiniu SDK, zod, pino, vitest, supertest. Monorepo managed by pnpm workspaces.

---

## Overview of files

```
day_nest/
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/...
│       ├── scripts/
│       │   └── seed.ts
│       ├── src/
│       │   ├── index.ts                  # entrypoint
│       │   ├── server.ts                 # build Fastify app
│       │   ├── config.ts                 # env loading
│       │   ├── db.ts                     # Prisma client singleton
│       │   ├── auth/
│       │   │   ├── password.ts           # argon2 hash/verify
│       │   │   ├── jwt.ts                # jose sign/verify
│       │   │   └── plugin.ts             # Fastify plugin: require user
│       │   ├── storage/
│       │   │   ├── provider.ts           # StorageProvider interface
│       │   │   └── qiniu.ts              # Qiniu adapter
│       │   ├── services/
│       │   │   ├── invites.ts
│       │   │   ├── tags.ts
│       │   │   ├── collections.ts
│       │   │   └── photos.ts
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── invites.ts
│       │   │   ├── uploads.ts
│       │   │   ├── collections.ts
│       │   │   ├── photos.ts
│       │   │   └── tags.ts
│       │   └── lib/
│       │       └── errors.ts             # AppError + handler
│       └── tests/
│           ├── helpers/buildApp.ts       # test fixture: in-mem DB
│           ├── helpers/storage.fake.ts   # fake storage provider
│           ├── auth.test.ts
│           ├── invites.test.ts
│           ├── uploads.test.ts
│           ├── collections.test.ts
│           ├── photos.test.ts
│           └── tags.test.ts
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── auth.ts                   # LoginInput, RegisterInput, UserDTO
            ├── collection.ts
            ├── photo.ts
            └── tag.ts
```

---

## Task 1: Monorepo skeleton

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "day-nest",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:api": "pnpm --filter @daynest/api dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.7.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Install pnpm if needed; init root**

```bash
pnpm install
```
Expected: no errors (workspace not yet populated).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: pnpm workspace skeleton"
```

---

## Task 2: Shared package (zod schemas)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/auth.ts`
- Create: `packages/shared/src/collection.ts`
- Create: `packages/shared/src/photo.ts`
- Create: `packages/shared/src/tag.ts`

- [ ] **Step 1: package.json**

```json
{
  "name": "@daynest/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc -p .",
    "test": "echo \"no tests in shared\""
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `src/auth.ts`**

```typescript
import { z } from 'zod';

export const RegisterInput = z.object({
  inviteToken: z.string().min(8),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  username: z.string(),
  password: z.string(),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const UserDTO = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarKey: z.string().nullable(),
});
export type UserDTO = z.infer<typeof UserDTO>;

export const AuthResponse = z.object({
  user: UserDTO,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;
```

- [ ] **Step 4: `src/tag.ts`**

```typescript
import { z } from 'zod';
export const TagDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  displayName: z.string(),
  photoCount: z.number().int().nonnegative().optional(),
  collectionCount: z.number().int().nonnegative().optional(),
});
export type TagDTO = z.infer<typeof TagDTO>;
```

- [ ] **Step 5: `src/photo.ts`**

```typescript
import { z } from 'zod';

export const PhotoDTO = z.object({
  id: z.string().uuid(),
  collectionId: z.string().uuid(),
  fileKey: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string().nullable(),
  takenAt: z.string().datetime().nullable(),
  orderIndex: z.number().int(),
  uploadedBy: z.string().uuid(),
  thumbnailUrl: z.string().url(),
  tags: z.array(z.string()).default([]),
});
export type PhotoDTO = z.infer<typeof PhotoDTO>;

export const PhotoInput = z.object({
  fileKey: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string().max(2000).nullable().default(null),
  takenAt: z.string().datetime().nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
});
export type PhotoInput = z.infer<typeof PhotoInput>;
```

- [ ] **Step 6: `src/collection.ts`**

```typescript
import { z } from 'zod';
import { PhotoDTO, PhotoInput } from './photo.js';
import { TagDTO } from './tag.js';

export const CollectionCreateInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).nullable().default(null),
  occurredOn: z.string().date(),
  occurredUntil: z.string().date().nullable().default(null),
  location: z.string().max(200).nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
  photos: z.array(PhotoInput).min(1).max(200),
});
export type CollectionCreateInput = z.infer<typeof CollectionCreateInput>;

export const CollectionUpdateInput = CollectionCreateInput
  .omit({ photos: true })
  .extend({ coverPhotoId: z.string().uuid().optional() })
  .partial();
export type CollectionUpdateInput = z.infer<typeof CollectionUpdateInput>;

export const CollectionSummaryDTO = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  occurredOn: z.string(),
  occurredUntil: z.string().nullable(),
  location: z.string().nullable(),
  coverPhoto: PhotoDTO.nullable(),
  tags: z.array(TagDTO),
  photoCount: z.number().int().nonnegative(),
  createdBy: z.string().uuid(),
});
export type CollectionSummaryDTO = z.infer<typeof CollectionSummaryDTO>;

export const CollectionDetailDTO = CollectionSummaryDTO.extend({
  photos: z.array(PhotoDTO),
});
export type CollectionDetailDTO = z.infer<typeof CollectionDetailDTO>;
```

- [ ] **Step 7: `src/index.ts`**

```typescript
export * from './auth.js';
export * from './collection.js';
export * from './photo.js';
export * from './tag.js';
```

- [ ] **Step 8: install & build**

```bash
pnpm install
pnpm --filter @daynest/shared build
```
Expected: `dist/` produced.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(shared): add zod DTOs for auth/collections/photos/tags"
```

---

## Task 3: API package skeleton

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/tests/helpers/buildApp.ts`
- Create: `apps/api/tests/server.test.ts`

- [ ] **Step 1: `apps/api/package.json`**

```json
{
  "name": "@daynest/api",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p .",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "seed": "tsx scripts/seed.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@daynest/shared": "workspace:*",
    "@fastify/cookie": "^9.3.1",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@prisma/client": "^5.13.0",
    "argon2": "^0.40.1",
    "fastify": "^4.27.0",
    "jose": "^5.4.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "qiniu": "^7.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "prisma": "^5.13.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src", "scripts", "tests"]
}
```

- [ ] **Step 3: `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ['tests/helpers/setup.ts'],
  },
});
```

- [ ] **Step 4: `tests/helpers/setup.ts`**

```typescript
import { beforeAll } from 'vitest';
import { config } from 'dotenv';
beforeAll(() => {
  config({ path: '.env.test' });
});
```

- [ ] **Step 5: `.env.test`**

```
NODE_ENV=test
DATABASE_URL=file:./test.db
JWT_SECRET=test-secret-test-secret-test-secret-test
JWT_REFRESH_SECRET=test-refresh-test-refresh-test-refresh
QINIU_ACCESS_KEY=fake-access-key
QINIU_SECRET_KEY=fake-secret-key
QINIU_BUCKET=daynest-test
QINIU_DOMAIN=https://daynest.fake.cdn
PORT=0
```

- [ ] **Step 6: TDD — Write failing test `tests/server.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';

describe('server', () => {
  it('responds to /healthz', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
```

- [ ] **Step 7: `tests/helpers/buildApp.ts` (stub)**

```typescript
import { buildServer } from '../../src/server.js';
export async function buildApp() {
  return buildServer({ logger: false });
}
```

- [ ] **Step 8: Run test to verify failure**

```bash
pnpm --filter @daynest/api test
```
Expected: FAIL (server module not found).

- [ ] **Step 9: Implement `src/server.ts`**

```typescript
import Fastify, { type FastifyServerOptions, type FastifyInstance } from 'fastify';

export async function buildServer(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify(opts);
  app.get('/healthz', async () => ({ status: 'ok' }));
  return app;
}
```

- [ ] **Step 10: Implement `src/index.ts`**

```typescript
import { buildServer } from './server.js';

const app = await buildServer({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  },
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
```

- [ ] **Step 11: Install deps + run test**

```bash
pnpm install
pnpm --filter @daynest/api test
```
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat(api): bootstrap fastify server with /healthz"
```

---

## Task 4: Config + DB (Prisma) setup

**Files:**
- Create: `apps/api/src/config.ts`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/db.ts`
- Create: `apps/api/tests/config.test.ts`

- [ ] **Step 1: TDD — Write `tests/config.test.ts`**

```typescript
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
        QINIU_DOMAIN: 'https://x',
      })
    ).toThrow(/JWT_SECRET/);
  });
});
```

- [ ] **Step 2: Run test — FAIL (config module not found)**

```bash
pnpm --filter @daynest/api test
```

- [ ] **Step 3: Implement `src/config.ts`**

```typescript
import { z } from 'zod';

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(30 * 24 * 60 * 60),
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(72),
  QINIU_ACCESS_KEY: z.string().min(1),
  QINIU_SECRET_KEY: z.string().min(1),
  QINIU_BUCKET: z.string().min(1),
  QINIU_DOMAIN: z.string().url(),
  QINIU_ZONE: z.enum(['z0','z1','z2','na0','as0','cn-east-2']).default('z0'),
  PORT: z.coerce.number().int().nonnegative().default(3000),
  CORS_ORIGIN: z.string().default('*'),
  COOKIE_DOMAIN: z.string().optional(),
});

export type AppConfig = {
  env: 'development' | 'test' | 'production';
  databaseUrl: string;
  jwt: { secret: string; refreshSecret: string; accessTtl: number; refreshTtl: number };
  invite: { ttlHours: number };
  qiniu: { accessKey: string; secretKey: string; bucket: string; domain: string; zone: string };
  port: number;
  corsOrigin: string;
  cookieDomain?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Schema.parse(env);
  return {
    env: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    jwt: {
      secret: parsed.JWT_SECRET,
      refreshSecret: parsed.JWT_REFRESH_SECRET,
      accessTtl: parsed.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtl: parsed.REFRESH_TOKEN_TTL_SECONDS,
    },
    invite: { ttlHours: parsed.INVITE_TOKEN_TTL_HOURS },
    qiniu: {
      accessKey: parsed.QINIU_ACCESS_KEY,
      secretKey: parsed.QINIU_SECRET_KEY,
      bucket: parsed.QINIU_BUCKET,
      domain: parsed.QINIU_DOMAIN,
      zone: parsed.QINIU_ZONE,
    },
    port: parsed.PORT,
    corsOrigin: parsed.CORS_ORIGIN,
    cookieDomain: parsed.COOKIE_DOMAIN,
  };
}
```

- [ ] **Step 4: Verify tests pass**

```bash
pnpm --filter @daynest/api test
```

- [ ] **Step 5: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  username      String   @unique
  displayName   String
  passwordHash  String
  avatarKey     String?
  createdAt     DateTime @default(now())
  collections   Collection[] @relation("CollectionCreator")
  photos        Photo[]      @relation("PhotoUploader")
  invitesIssued Invite[]     @relation("InviteIssuer")
  tagsCreated   Tag[]        @relation("TagCreator")
}

model Invite {
  id         String   @id @default(uuid())
  token      String   @unique
  issuedById String
  issuedBy   User     @relation("InviteIssuer", fields: [issuedById], references: [id])
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())
}

model Collection {
  id            String   @id @default(uuid())
  title         String
  description   String?
  occurredOn    DateTime
  occurredUntil DateTime?
  location      String?
  coverPhotoId  String?  @unique
  coverPhoto    Photo?   @relation("CollectionCover", fields: [coverPhotoId], references: [id])
  createdById   String
  createdBy     User     @relation("CollectionCreator", fields: [createdById], references: [id])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  photos        Photo[]  @relation("CollectionPhotos")
  tags          CollectionTag[]

  @@index([occurredOn])
}

model Photo {
  id           String   @id @default(uuid())
  collectionId String
  collection   Collection @relation("CollectionPhotos", fields: [collectionId], references: [id], onDelete: Cascade)
  fileKey      String
  width        Int
  height       Int
  caption      String?
  takenAt      DateTime?
  orderIndex   Int
  uploadedById String
  uploadedBy   User     @relation("PhotoUploader", fields: [uploadedById], references: [id])
  createdAt    DateTime @default(now())
  tags         PhotoTag[]
  asCoverOf    Collection? @relation("CollectionCover")

  @@index([collectionId, orderIndex])
}

model Tag {
  id           String   @id @default(uuid())
  name         String   @unique
  displayName  String
  createdById  String
  createdBy    User     @relation("TagCreator", fields: [createdById], references: [id])
  createdAt    DateTime @default(now())
  photos       PhotoTag[]
  collections  CollectionTag[]
}

model PhotoTag {
  photoId String
  tagId   String
  photo   Photo @relation(fields: [photoId], references: [id], onDelete: Cascade)
  tag     Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([photoId, tagId])
}

model CollectionTag {
  collectionId String
  tagId        String
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  tag          Tag        @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([collectionId, tagId])
}
```

- [ ] **Step 6: Implement `src/db.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
    });
  }
  return _prisma;
}

export async function disconnectPrisma() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
```

- [ ] **Step 7: Initialize DB**

```bash
pnpm --filter @daynest/api exec prisma generate
DATABASE_URL='file:./dev.db' pnpm --filter @daynest/api exec prisma migrate dev --name init
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(api): config loader + prisma schema + initial migration"
```

---

## Task 5: Test helper — buildApp with fresh DB

**Files:**
- Modify: `apps/api/tests/helpers/buildApp.ts`
- Create: `apps/api/tests/helpers/db.ts`
- Create: `apps/api/tests/helpers/storage.fake.ts`

- [ ] **Step 1: `tests/helpers/storage.fake.ts`**

```typescript
import type { StorageProvider, UploadTokenBundle } from '../../src/storage/provider.js';

export class FakeStorage implements StorageProvider {
  public uploaded: string[] = [];
  public deleted: string[] = [];

  async createUploadToken(key: string): Promise<UploadTokenBundle> {
    this.uploaded.push(key);
    return {
      token: `fake-token-${key}`,
      key,
      uploadUrl: 'https://fake-upload',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }

  signDownload(key: string): string {
    return `https://daynest.fake.cdn/${key}?token=signed`;
  }

  signThumbnail(key: string, width: number): string {
    return `https://daynest.fake.cdn/${key}?imageMogr2/thumbnail/x${width}&token=signed`;
  }

  async deleteObject(key: string): Promise<void> {
    this.deleted.push(key);
  }
}
```

- [ ] **Step 2: `tests/helpers/db.ts`**

```typescript
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export function resetTestDb() {
  const dbPath = path.resolve(process.cwd(), 'test.db');
  if (existsSync(dbPath)) unlinkSync(dbPath);
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'ignore',
  });
}
```

- [ ] **Step 3: Replace `tests/helpers/buildApp.ts`**

```typescript
import { buildServer } from '../../src/server.js';
import { FakeStorage } from './storage.fake.js';
import { resetTestDb } from './db.js';
import { getPrisma, disconnectPrisma } from '../../src/db.js';
import { loadConfig } from '../../src/config.js';

export async function buildApp() {
  resetTestDb();
  const config = loadConfig();
  const storage = new FakeStorage();
  const prisma = getPrisma();
  const app = await buildServer({ logger: false }, { config, storage, prisma });
  return { app, storage, prisma, config, cleanup: async () => { await app.close(); await disconnectPrisma(); } };
}
```

- [ ] **Step 4: Update `src/server.ts` to accept deps**

```typescript
import Fastify, { type FastifyServerOptions, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { StorageProvider } from './storage/provider.js';
import type { PrismaClient } from '@prisma/client';

export type AppDeps = {
  config: AppConfig;
  storage: StorageProvider;
  prisma: PrismaClient;
};

declare module 'fastify' {
  interface FastifyInstance { deps: AppDeps }
}

export async function buildServer(
  opts: FastifyServerOptions = {},
  deps?: AppDeps
): Promise<FastifyInstance> {
  const app = Fastify(opts);
  if (deps) app.decorate('deps', deps);
  app.get('/healthz', async () => ({ status: 'ok' }));
  return app;
}
```

- [ ] **Step 5: Update healthz test (still passes)**

```bash
pnpm --filter @daynest/api test
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test(api): buildApp helper with fresh DB + fake storage"
```

---

## Task 6: Storage provider interface + Qiniu adapter

**Files:**
- Create: `apps/api/src/storage/provider.ts`
- Create: `apps/api/src/storage/qiniu.ts`
- Create: `apps/api/tests/storage.test.ts`

- [ ] **Step 1: TDD — `tests/storage.test.ts` (testing only the interface contract via fake)**

```typescript
import { describe, it, expect } from 'vitest';
import { FakeStorage } from './helpers/storage.fake.js';

describe('StorageProvider contract', () => {
  it('returns upload bundle with token + key', async () => {
    const s = new FakeStorage();
    const b = await s.createUploadToken('photos/c1/p1.jpg');
    expect(b.token).toMatch(/fake-token/);
    expect(b.key).toBe('photos/c1/p1.jpg');
  });

  it('signs thumbnail URL with width param', () => {
    const url = new FakeStorage().signThumbnail('photos/x.jpg', 800);
    expect(url).toContain('thumbnail/x800');
  });
});
```

- [ ] **Step 2: `src/storage/provider.ts`**

```typescript
export type UploadTokenBundle = {
  token: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
};

export interface StorageProvider {
  createUploadToken(key: string): Promise<UploadTokenBundle>;
  signDownload(key: string, ttlSeconds?: number): string;
  signThumbnail(key: string, widthPx: number): string;
  deleteObject(key: string): Promise<void>;
}
```

- [ ] **Step 3: `src/storage/qiniu.ts`**

```typescript
import qiniu from 'qiniu';
import type { StorageProvider, UploadTokenBundle } from './provider.js';

const ZONE_MAP: Record<string, qiniu.zone.Zone> = {
  z0: qiniu.zone.Zone_z0,
  z1: qiniu.zone.Zone_z1,
  z2: qiniu.zone.Zone_z2,
  na0: qiniu.zone.Zone_na0,
  as0: qiniu.zone.Zone_as0,
};

const UPLOAD_HOSTS: Record<string, string> = {
  z0: 'https://upload.qiniup.com',
  z1: 'https://upload-z1.qiniup.com',
  z2: 'https://upload-z2.qiniup.com',
  na0: 'https://upload-na0.qiniup.com',
  as0: 'https://upload-as0.qiniup.com',
};

export class QiniuStorage implements StorageProvider {
  private mac: qiniu.auth.digest.Mac;
  constructor(
    private opts: {
      accessKey: string;
      secretKey: string;
      bucket: string;
      domain: string;
      zone: string;
      uploadTtlSeconds?: number;
    }
  ) {
    this.mac = new qiniu.auth.digest.Mac(opts.accessKey, opts.secretKey);
  }

  async createUploadToken(key: string): Promise<UploadTokenBundle> {
    const policy = new qiniu.rs.PutPolicy({
      scope: `${this.opts.bucket}:${key}`,
      expires: this.opts.uploadTtlSeconds ?? 3600,
      returnBody: JSON.stringify({ key: '$(key)', hash: '$(etag)', size: '$(fsize)' }),
    });
    const token = policy.uploadToken(this.mac);
    return {
      token,
      key,
      uploadUrl: UPLOAD_HOSTS[this.opts.zone] ?? UPLOAD_HOSTS.z0,
      expiresAt: new Date(Date.now() + (this.opts.uploadTtlSeconds ?? 3600) * 1000).toISOString(),
    };
  }

  signDownload(key: string, ttlSeconds = 3600): string {
    const baseUrl = `${this.opts.domain}/${key}`;
    const deadline = Math.floor(Date.now() / 1000) + ttlSeconds;
    return qiniu.util.generateAccessToken(this.mac, baseUrl + `?e=${deadline}`)
      ? this.signedUrl(baseUrl, deadline)
      : baseUrl;
  }

  signThumbnail(key: string, widthPx: number): string {
    const baseUrl = `${this.opts.domain}/${key}?imageMogr2/thumbnail/x${widthPx}/format/webp`;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    return this.signedUrl(baseUrl, deadline);
  }

  async deleteObject(key: string): Promise<void> {
    const cfg = new qiniu.conf.Config({ zone: ZONE_MAP[this.opts.zone] ?? qiniu.zone.Zone_z0 });
    const bucketManager = new qiniu.rs.BucketManager(this.mac, cfg);
    await new Promise<void>((resolve, reject) => {
      bucketManager.delete(this.opts.bucket, key, (err) => (err ? reject(err) : resolve()));
    });
  }

  private signedUrl(url: string, deadline: number): string {
    const sep = url.includes('?') ? '&' : '?';
    const toSign = `${url}${sep}e=${deadline}`;
    const sign = qiniu.util.hmacSha1(toSign, this.opts.secretKey);
    const encodedSign = qiniu.util.base64ToUrlSafe(sign);
    return `${toSign}&token=${this.opts.accessKey}:${encodedSign}`;
  }
}
```

- [ ] **Step 4: Verify tests pass**

```bash
pnpm --filter @daynest/api test
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): storage provider interface + Qiniu adapter"
```

---

## Task 7: Password hashing utility

**Files:**
- Create: `apps/api/src/auth/password.ts`
- Create: `apps/api/tests/password.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password', () => {
  it('verifies the same password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
  });
  it('rejects wrong password', async () => {
    const h = await hashPassword('a-strong-password');
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `src/auth/password.ts`**

```typescript
import argon2 from 'argon2';

const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 1 << 16,
  timeCost: 3,
  parallelism: 2,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try { return await argon2.verify(hash, plain); }
  catch { return false; }
}
```

- [ ] **Step 4: Tests pass**

```bash
pnpm --filter @daynest/api test
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(auth): argon2id password hashing utility"
```

---

## Task 8: JWT utility (jose)

**Files:**
- Create: `apps/api/src/auth/jwt.ts`
- Create: `apps/api/tests/jwt.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { signAccess, verifyAccess, signRefresh, verifyRefresh } from '../src/auth/jwt.js';

const secret = 'a'.repeat(32);
const refreshSecret = 'b'.repeat(32);

describe('jwt', () => {
  it('signs and verifies access token', async () => {
    const token = await signAccess({ sub: 'user-1' }, secret, 60);
    const claims = await verifyAccess(token, secret);
    expect(claims.sub).toBe('user-1');
  });
  it('rejects expired access token', async () => {
    const token = await signAccess({ sub: 'user-1' }, secret, -1);
    await expect(verifyAccess(token, secret)).rejects.toThrow();
  });
  it('refresh token uses separate secret', async () => {
    const token = await signRefresh({ sub: 'user-1' }, refreshSecret, 60);
    await expect(verifyAccess(token, secret)).rejects.toThrow();
    const claims = await verifyRefresh(token, refreshSecret);
    expect(claims.sub).toBe('user-1');
  });
});
```

- [ ] **Step 2: Implement `src/auth/jwt.ts`**

```typescript
import { SignJWT, jwtVerify } from 'jose';

const enc = new TextEncoder();

export type JwtClaims = { sub: string; [k: string]: unknown };

export async function signAccess(claims: JwtClaims, secret: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return new SignJWT({ ...claims, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(enc.encode(secret));
}

export async function verifyAccess(token: string, secret: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, enc.encode(secret));
  if (payload.typ !== 'access') throw new Error('wrong-token-type');
  return payload as JwtClaims;
}

export async function signRefresh(claims: JwtClaims, secret: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return new SignJWT({ ...claims, typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(enc.encode(secret));
}

export async function verifyRefresh(token: string, secret: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, enc.encode(secret));
  if (payload.typ !== 'refresh') throw new Error('wrong-token-type');
  return payload as JwtClaims;
}
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(auth): jose-based JWT access + refresh utilities"
```

---

## Task 9: Auth plugin (require user middleware)

**Files:**
- Create: `apps/api/src/auth/plugin.ts`
- Create: `apps/api/src/lib/errors.ts`
- Modify: `apps/api/src/server.ts` to register plugin
- Create: `apps/api/tests/authPlugin.test.ts`

- [ ] **Step 1: `src/lib/errors.ts`**

```typescript
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
```

- [ ] **Step 2: TDD — `tests/authPlugin.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

describe('auth plugin', () => {
  it('blocks request without token (401)', async () => {
    const { app, cleanup } = await buildApp();
    app.get('/private', { onRequest: [app.requireUser] }, async (req) => ({ sub: req.user.id }));
    const res = await app.inject({ method: 'GET', url: '/private' });
    expect(res.statusCode).toBe(401);
    await cleanup();
  });

  it('allows request with valid token', async () => {
    const { app, config, prisma, cleanup } = await buildApp();
    const user = await prisma.user.create({
      data: { username: 'alice', displayName: 'Alice', passwordHash: 'x' },
    });
    app.get('/private', { onRequest: [app.requireUser] }, async (req) => ({ sub: req.user.id }));
    const token = await signAccess({ sub: user.id }, config.jwt.secret, 60);
    const res = await app.inject({ method: 'GET', url: '/private', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sub: user.id });
    await cleanup();
  });
});
```

- [ ] **Step 3: Implement `src/auth/plugin.ts`**

```typescript
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { verifyAccess } from './jwt.js';
import { AppError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest { user: { id: string; username: string } }
  interface FastifyInstance {
    requireUser: (req: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('requireUser', async function (req: FastifyRequest) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHENTICATED', 'missing access token');
    }
    const token = header.slice('Bearer '.length);
    let claims;
    try {
      claims = await verifyAccess(token, app.deps.config.jwt.secret);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'invalid or expired token');
    }
    const user = await app.deps.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user) throw new AppError(401, 'USER_GONE', 'user no longer exists');
    req.user = { id: user.id, username: user.username };
  });
});
```

- [ ] **Step 4: Register in `src/server.ts`**

```typescript
import { authPlugin } from './auth/plugin.js';
import { AppError } from './lib/errors.js';
// ... inside buildServer, after decorate('deps'):
if (deps) {
  await app.register(authPlugin);
}

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof AppError) {
    return reply.status(err.status).send({ code: err.code, message: err.message });
  }
  if ((err as any).validation) {
    return reply.status(400).send({ code: 'VALIDATION_ERROR', message: err.message });
  }
  app.log.error(err);
  return reply.status(500).send({ code: 'INTERNAL', message: 'internal error' });
});
```

- [ ] **Step 5: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(auth): requireUser plugin + central error handler"
```

---

## Task 10: Invite token service + endpoint

**Files:**
- Create: `apps/api/src/services/invites.ts`
- Create: `apps/api/src/routes/invites.ts`
- Modify: `apps/api/src/server.ts` to register
- Create: `apps/api/tests/invites.test.ts`

- [ ] **Step 1: TDD — `tests/invites.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

async function bootstrap(app: Awaited<ReturnType<typeof buildApp>>) {
  const user = await app.prisma.user.create({
    data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
  });
  const token = await signAccess({ sub: user.id }, app.config.jwt.secret, 60);
  return { user, token };
}

describe('POST /api/invites', () => {
  it('requires auth', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/invites' });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('creates a token', async () => {
    const ctx = await buildApp();
    const { token } = await bootstrap(ctx);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/invites',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toMatch(/^[a-zA-Z0-9_-]{16,}$/);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: `src/services/invites.ts`**

```typescript
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export async function createInvite(prisma: PrismaClient, issuerId: string, ttlHours: number) {
  const token = randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
  const invite = await prisma.invite.create({
    data: { token, issuedById: issuerId, expiresAt },
  });
  return invite;
}

export async function consumeInvite(prisma: PrismaClient, token: string) {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) throw new Error('INVALID_INVITE');
  if (invite.consumedAt) throw new Error('INVITE_ALREADY_USED');
  if (invite.expiresAt.getTime() < Date.now()) throw new Error('INVITE_EXPIRED');
  await prisma.invite.update({ where: { id: invite.id }, data: { consumedAt: new Date() } });
  return invite;
}
```

- [ ] **Step 3: `src/routes/invites.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { createInvite } from '../services/invites.js';

export async function registerInviteRoutes(app: FastifyInstance) {
  app.post('/api/invites', { onRequest: [app.requireUser] }, async (req) => {
    const invite = await createInvite(app.deps.prisma, req.user.id, app.deps.config.invite.ttlHours);
    return { token: invite.token, expiresAt: invite.expiresAt.toISOString() };
  });
}
```

- [ ] **Step 4: Register in `server.ts` (add inside buildServer after authPlugin)**

```typescript
import { registerInviteRoutes } from './routes/invites.js';
// ...
if (deps) {
  await app.register(authPlugin);
  await registerInviteRoutes(app);
}
```

- [ ] **Step 5: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(api): invite token creation + consumption service"
```

---

## Task 11: Register endpoint (using invite)

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Create: `apps/api/tests/register.test.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: TDD**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';

describe('POST /api/auth/register', () => {
  it('creates first user with invite', async () => {
    const ctx = await buildApp();
    const bootstrapUser = await ctx.prisma.user.create({
      data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' },
    });
    const invite = await ctx.prisma.invite.create({
      data: { token: 'invite-xyz', issuedById: bootstrapUser.id, expiresAt: new Date(Date.now()+3600_000) },
    });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { inviteToken: invite.token, username: 'dad', displayName: 'Dad', password: 'longenoughpw' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.username).toBe('dad');
    expect(body.accessToken).toBeTruthy();
    expect(await ctx.prisma.user.count()).toBe(2);
    expect((await ctx.prisma.invite.findUnique({ where: { id: invite.id } }))!.consumedAt).not.toBeNull();
    await ctx.cleanup();
  });

  it('rejects bad invite', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { inviteToken: 'nope-nope-nope', username: 'who', displayName: 'X', password: 'longenoughpw' },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });

  it('rejects duplicate username', async () => {
    const ctx = await buildApp();
    const issuer = await ctx.prisma.user.create({ data: { username: 'mom', displayName: 'Mom', passwordHash: 'x' } });
    const invite = await ctx.prisma.invite.create({ data: { token: 't1', issuedById: issuer.id, expiresAt: new Date(Date.now()+3600_000) } });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { inviteToken: invite.token, username: 'mom', displayName: 'Y', password: 'longenoughpw' },
    });
    expect(res.statusCode).toBe(400);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement `src/routes/auth.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { RegisterInput, LoginInput, type AuthResponse } from '@daynest/shared';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signAccess, signRefresh, verifyRefresh } from '../auth/jwt.js';
import { consumeInvite } from '../services/invites.js';
import { AppError } from '../lib/errors.js';

const REFRESH_COOKIE = 'daynest_rt';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    const parsed = RegisterInput.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map(i => i.message).join('; '));
    const { inviteToken, username, displayName, password } = parsed.data;
    const existing = await app.deps.prisma.user.findUnique({ where: { username } });
    if (existing) throw new AppError(400, 'USERNAME_TAKEN', 'username already in use');
    try {
      await consumeInvite(app.deps.prisma, inviteToken);
    } catch (e: any) {
      throw new AppError(400, e.message, 'invite token invalid or expired');
    }
    const passwordHash = await hashPassword(password);
    const user = await app.deps.prisma.user.create({ data: { username, displayName, passwordHash } });
    return issueTokens(app, reply, user);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginInput.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
    const user = await app.deps.prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (!user) throw new AppError(401, 'BAD_CREDENTIALS', 'invalid username or password');
    const ok = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!ok) throw new AppError(401, 'BAD_CREDENTIALS', 'invalid username or password');
    return issueTokens(app, reply, user);
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    const rt = (req.cookies as any)?.[REFRESH_COOKIE];
    if (!rt) throw new AppError(401, 'NO_REFRESH', 'missing refresh cookie');
    let claims;
    try { claims = await verifyRefresh(rt, app.deps.config.jwt.refreshSecret); }
    catch { throw new AppError(401, 'BAD_REFRESH', 'invalid refresh'); }
    const user = await app.deps.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user) throw new AppError(401, 'USER_GONE', 'user not found');
    return issueTokens(app, reply, user);
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { ok: true };
  });

  app.get('/api/auth/me', { onRequest: [app.requireUser] }, async (req) => {
    const user = await app.deps.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'user gone');
    return { user: toUserDTO(user) };
  });
}

async function issueTokens(app: FastifyInstance, reply: any, user: { id: string; username: string; displayName: string; avatarKey: string | null }): Promise<AuthResponse> {
  const access = await signAccess({ sub: user.id }, app.deps.config.jwt.secret, app.deps.config.jwt.accessTtl);
  const refresh = await signRefresh({ sub: user.id }, app.deps.config.jwt.refreshSecret, app.deps.config.jwt.refreshTtl);
  reply.setCookie(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: app.deps.config.env === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    domain: app.deps.config.cookieDomain,
    maxAge: app.deps.config.jwt.refreshTtl,
  });
  return { user: toUserDTO(user), accessToken: access };
}

function toUserDTO(u: { id: string; username: string; displayName: string; avatarKey: string | null }) {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarKey: u.avatarKey };
}
```

- [ ] **Step 3: Register cookie plugin + routes in `server.ts`**

```typescript
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './routes/auth.js';
// in buildServer:
await app.register(cookie);
// ... after authPlugin:
await registerAuthRoutes(app);
```

- [ ] **Step 4: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(auth): register/login/refresh/logout/me endpoints"
```

---

## Task 12: Login + refresh tests

**Files:**
- Create: `apps/api/tests/login.test.ts`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { hashPassword } from '../src/auth/password.js';

describe('POST /api/auth/login', () => {
  it('returns tokens on success', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({ data: { username: 'dad', displayName: 'Dad', passwordHash: await hashPassword('hello-world-2024') } });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'dad', password: 'hello-world-2024' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeTruthy();
    await ctx.cleanup();
  });

  it('fails on wrong password', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({ data: { username: 'dad', displayName: 'Dad', passwordHash: await hashPassword('right-password') } });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'dad', password: 'wrong' } });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Verify pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "test(auth): login success + bad password"
```

---

## Task 13: Upload token endpoint

**Files:**
- Create: `apps/api/src/routes/uploads.ts`
- Create: `apps/api/tests/uploads.test.ts`

- [ ] **Step 1: TDD**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

describe('POST /api/uploads/token', () => {
  it('requires auth', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({ method: 'POST', url: '/api/uploads/token', payload: { ext: 'jpg' } });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('returns token with key under photos/', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'mom', displayName: 'M', passwordHash: 'x' } });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/uploads/token',
      headers: { authorization: `Bearer ${t}` },
      payload: { ext: 'jpg', count: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tokens).toHaveLength(2);
    expect(body.tokens[0].key).toMatch(/^photos\//);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement `src/routes/uploads.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { AppError } from '../lib/errors.js';

const Body = z.object({
  ext: z.string().regex(/^[a-z0-9]{1,5}$/).default('jpg'),
  count: z.number().int().min(1).max(50).default(1),
  collectionDraftId: z.string().uuid().optional(),
});

export async function registerUploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads/token', { onRequest: [app.requireUser] }, async (req) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
    const { ext, count, collectionDraftId } = parsed.data;
    const folder = collectionDraftId ?? `draft-${req.user.id}-${Date.now()}`;
    const tokens = await Promise.all(
      Array.from({ length: count }, async () => {
        const photoId = randomUUID();
        const key = `photos/${folder}/${photoId}.${ext}`;
        return app.deps.storage.createUploadToken(key);
      })
    );
    return { tokens };
  });
}
```

- [ ] **Step 3: Register route in server.ts**

```typescript
import { registerUploadRoutes } from './routes/uploads.js';
// after registerAuthRoutes:
await registerUploadRoutes(app);
```

- [ ] **Step 4: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(uploads): direct-to-storage upload token endpoint"
```

---

## Task 14: Tag service (normalization, get-or-create)

**Files:**
- Create: `apps/api/src/services/tags.ts`
- Create: `apps/api/tests/tagsService.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { upsertTags, normalizeTagName } from '../src/services/tags.js';

describe('tag normalization', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeTagName('  Sakura  ')).toBe('sakura');
    expect(normalizeTagName('FUJI 山')).toBe('fuji 山');
  });
});

describe('upsertTags', () => {
  it('idempotently creates tags', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'm', displayName: 'M', passwordHash: 'x' } });
    const a = await upsertTags(ctx.prisma, u.id, ['Sakura', '富士山']);
    const b = await upsertTags(ctx.prisma, u.id, ['sakura', '富士山']);
    expect(a.map(t => t.id).sort()).toEqual(b.map(t => t.id).sort());
    expect(await ctx.prisma.tag.count()).toBe(2);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement `src/services/tags.ts`**

```typescript
import type { PrismaClient, Tag } from '@prisma/client';

export function normalizeTagName(input: string): string {
  return input.trim().toLocaleLowerCase();
}

export async function upsertTags(prisma: PrismaClient, creatorId: string, names: string[]): Promise<Tag[]> {
  const display = Array.from(new Set(names.map(n => n.trim()).filter(Boolean)));
  if (display.length === 0) return [];
  const result: Tag[] = [];
  for (const d of display) {
    const normalized = normalizeTagName(d);
    const tag = await prisma.tag.upsert({
      where: { name: normalized },
      update: {},
      create: { name: normalized, displayName: d, createdById: creatorId },
    });
    result.push(tag);
  }
  return result;
}
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(tags): normalized get-or-create service"
```

---

## Task 15: Create collection endpoint

**Files:**
- Create: `apps/api/src/services/collections.ts`
- Create: `apps/api/src/routes/collections.ts`
- Create: `apps/api/tests/createCollection.test.ts`

- [ ] **Step 1: TDD**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';

describe('POST /api/collections', () => {
  it('creates collection + photos + tags transactionally', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'mom', displayName: 'M', passwordHash: 'x' } });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/collections',
      headers: { authorization: `Bearer ${t}` },
      payload: {
        title: '富士山樱花季',
        description: '一场粉色的迁徙',
        occurredOn: '2024-04-12',
        occurredUntil: '2024-04-18',
        location: '日本 山梨县',
        tags: ['日本', '樱花'],
        photos: [
          { fileKey: 'photos/draft/p1.jpg', width: 4000, height: 3000, caption: '河口湖', takenAt: null, tags: ['河口湖'] },
          { fileKey: 'photos/draft/p2.jpg', width: 4000, height: 3000, caption: null, takenAt: null, tags: [] },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTruthy();
    expect(body.photoCount).toBe(2);
    expect(body.tags.map((t: any) => t.name).sort()).toEqual(['樱花', '日本'].sort());
    expect(body.coverPhoto.fileKey).toBe('photos/draft/p1.jpg');
    expect(await ctx.prisma.tag.count()).toBe(3); // 日本, 樱花, 河口湖
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement `src/services/collections.ts`**

```typescript
import type { PrismaClient } from '@prisma/client';
import type { CollectionCreateInput } from '@daynest/shared';
import { upsertTags } from './tags.js';

export async function createCollection(
  prisma: PrismaClient,
  userId: string,
  input: CollectionCreateInput
) {
  return prisma.$transaction(async (tx) => {
    const collection = await tx.collection.create({
      data: {
        title: input.title,
        description: input.description,
        occurredOn: new Date(input.occurredOn),
        occurredUntil: input.occurredUntil ? new Date(input.occurredUntil) : null,
        location: input.location,
        createdById: userId,
      },
    });

    const collectionTags = await upsertTags(tx as unknown as PrismaClient, userId, input.tags);
    if (collectionTags.length > 0) {
      await tx.collectionTag.createMany({
        data: collectionTags.map(t => ({ collectionId: collection.id, tagId: t.id })),
      });
    }

    const photos = await Promise.all(
      input.photos.map(async (p, idx) => {
        const photo = await tx.photo.create({
          data: {
            collectionId: collection.id,
            fileKey: p.fileKey,
            width: p.width,
            height: p.height,
            caption: p.caption,
            takenAt: p.takenAt ? new Date(p.takenAt) : null,
            orderIndex: idx,
            uploadedById: userId,
          },
        });
        if (p.tags.length > 0) {
          const photoTags = await upsertTags(tx as unknown as PrismaClient, userId, p.tags);
          await tx.photoTag.createMany({
            data: photoTags.map(t => ({ photoId: photo.id, tagId: t.id })),
          });
        }
        return photo;
      })
    );

    await tx.collection.update({
      where: { id: collection.id },
      data: { coverPhotoId: photos[0].id },
    });

    return collection.id;
  });
}
```

- [ ] **Step 3: Implement `src/routes/collections.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { CollectionCreateInput } from '@daynest/shared';
import { createCollection } from '../services/collections.js';
import { AppError } from '../lib/errors.js';
import { buildCollectionDetail, buildCollectionSummary } from '../services/collectionView.js';

export async function registerCollectionRoutes(app: FastifyInstance) {
  app.post('/api/collections', { onRequest: [app.requireUser] }, async (req, reply) => {
    const parsed = CollectionCreateInput.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues.map(i=>i.message).join('; '));
    const id = await createCollection(app.deps.prisma, req.user.id, parsed.data);
    const dto = await buildCollectionDetail(app.deps.prisma, app.deps.storage, id);
    reply.status(201);
    return dto;
  });
}
```

- [ ] **Step 4: Implement `src/services/collectionView.ts` (view helpers for DTO conversion)**

```typescript
import type { PrismaClient } from '@prisma/client';
import type { StorageProvider } from '../storage/provider.js';
import type { CollectionSummaryDTO, CollectionDetailDTO, PhotoDTO, TagDTO } from '@daynest/shared';

function tagDto(t: { id: string; name: string; displayName: string }): TagDTO {
  return { id: t.id, name: t.name, displayName: t.displayName };
}

function photoDto(p: any, storage: StorageProvider): PhotoDTO {
  return {
    id: p.id, collectionId: p.collectionId, fileKey: p.fileKey,
    width: p.width, height: p.height, caption: p.caption,
    takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    orderIndex: p.orderIndex, uploadedBy: p.uploadedById,
    thumbnailUrl: storage.signThumbnail(p.fileKey, 800),
    tags: (p.tags ?? []).map((pt: any) => pt.tag.displayName),
  };
}

export async function buildCollectionDetail(prisma: PrismaClient, storage: StorageProvider, id: string): Promise<CollectionDetailDTO> {
  const c = await prisma.collection.findUniqueOrThrow({
    where: { id },
    include: {
      coverPhoto: { include: { tags: { include: { tag: true } } } },
      tags: { include: { tag: true } },
      photos: { orderBy: { orderIndex: 'asc' }, include: { tags: { include: { tag: true } } } },
    },
  });
  const tagSet = new Map<string, TagDTO>();
  c.tags.forEach(ct => tagSet.set(ct.tag.id, tagDto(ct.tag)));
  c.photos.forEach(p => p.tags.forEach(pt => tagSet.set(pt.tag.id, tagDto(pt.tag))));
  return {
    id: c.id, title: c.title, description: c.description,
    occurredOn: c.occurredOn.toISOString().slice(0,10),
    occurredUntil: c.occurredUntil ? c.occurredUntil.toISOString().slice(0,10) : null,
    location: c.location,
    coverPhoto: c.coverPhoto ? photoDto(c.coverPhoto, storage) : null,
    tags: Array.from(tagSet.values()),
    photoCount: c.photos.length,
    createdBy: c.createdById,
    photos: c.photos.map(p => photoDto(p, storage)),
  };
}

export async function buildCollectionSummary(prisma: PrismaClient, storage: StorageProvider, id: string): Promise<CollectionSummaryDTO> {
  const detail = await buildCollectionDetail(prisma, storage, id);
  const { photos, ...rest } = detail;
  return rest;
}
```

- [ ] **Step 5: Register route in server.ts**

```typescript
import { registerCollectionRoutes } from './routes/collections.js';
await registerCollectionRoutes(app);
```

- [ ] **Step 6: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(collections): create endpoint with transactional photos + tags"
```

---

## Task 16: List collections (cursor pagination + tag filter)

**Files:**
- Modify: `apps/api/src/routes/collections.ts`
- Create: `apps/api/tests/listCollections.test.ts`

- [ ] **Step 1: TDD**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

async function seed(ctx: Awaited<ReturnType<typeof buildApp>>) {
  const u = await ctx.prisma.user.create({ data: { username: 'a', displayName: 'A', passwordHash: 'x' } });
  for (let i = 0; i < 25; i++) {
    await createCollection(ctx.prisma, u.id, {
      title: `c${i}`, description: null,
      occurredOn: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
      occurredUntil: null, location: null,
      tags: i % 2 ? ['樱花'] : ['毕业'],
      photos: [{ fileKey: `photos/${i}.jpg`, width: 100, height: 100, caption: null, takenAt: null, tags: [] }],
    });
  }
  const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
  return { token: t };
}

describe('GET /api/collections', () => {
  it('paginates by cursor in occurred_on DESC', async () => {
    const ctx = await buildApp();
    const { token } = await seed(ctx);
    const r1 = await ctx.app.inject({ method: 'GET', url: '/api/collections?limit=10', headers: { authorization: `Bearer ${token}` } });
    expect(r1.statusCode).toBe(200);
    const b1 = r1.json();
    expect(b1.items).toHaveLength(10);
    expect(b1.nextCursor).toBeTruthy();
    const r2 = await ctx.app.inject({ method: 'GET', url: `/api/collections?limit=10&cursor=${encodeURIComponent(b1.nextCursor)}`, headers: { authorization: `Bearer ${token}` } });
    const b2 = r2.json();
    expect(b2.items[0].id).not.toBe(b1.items[0].id);
    await ctx.cleanup();
  });

  it('filters by tag', async () => {
    const ctx = await buildApp();
    const { token } = await seed(ctx);
    const r = await ctx.app.inject({ method: 'GET', url: '/api/collections?tag=樱花&limit=50', headers: { authorization: `Bearer ${token}` } });
    const b = r.json();
    expect(b.items.length).toBeGreaterThan(0);
    b.items.forEach((c: any) => expect(c.tags.some((t: any) => t.name === '樱花')).toBe(true));
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement listing in `src/routes/collections.ts`**

```typescript
import { z } from 'zod';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(), // base64({ occurredOn, id })
  tag: z.string().optional(),
});

// inside registerCollectionRoutes:
app.get('/api/collections', { onRequest: [app.requireUser] }, async (req) => {
  const q = ListQuery.parse(req.query);
  const where: any = {};
  if (q.tag) {
    const t = await app.deps.prisma.tag.findUnique({ where: { name: q.tag.toLocaleLowerCase().trim() } });
    if (!t) return { items: [], nextCursor: null };
    where.OR = [
      { tags: { some: { tagId: t.id } } },
      { photos: { some: { tags: { some: { tagId: t.id } } } } },
    ];
  }
  if (q.cursor) {
    const decoded = JSON.parse(Buffer.from(q.cursor, 'base64url').toString());
    where.OR = [
      ...(where.OR ?? []),
      { occurredOn: { lt: new Date(decoded.occurredOn) } },
      { occurredOn: new Date(decoded.occurredOn), id: { lt: decoded.id } },
    ];
  }
  const rows = await app.deps.prisma.collection.findMany({
    where,
    orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    select: { id: true, occurredOn: true },
  });
  const hasMore = rows.length > q.limit;
  const sliced = hasMore ? rows.slice(0, q.limit) : rows;
  const items = await Promise.all(sliced.map(r => buildCollectionSummary(app.deps.prisma, app.deps.storage, r.id)));
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ occurredOn: sliced[sliced.length - 1].occurredOn.toISOString(), id: sliced[sliced.length - 1].id })).toString('base64url')
    : null;
  return { items, nextCursor };
});
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(collections): cursor list + tag filter"
```

---

## Task 17: Get / update / delete collection

**Files:**
- Modify: `apps/api/src/routes/collections.ts`
- Create: `apps/api/tests/collectionDetail.test.ts`

- [ ] **Step 1: TDD**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

describe('collection detail', () => {
  it('GET /:id returns photos + signed thumbnails', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'a', displayName: 'A', passwordHash: 'x' } });
    const id = await createCollection(ctx.prisma, u.id, {
      title: 't', description: null, occurredOn: '2024-01-01', occurredUntil: null, location: null,
      tags: [], photos: [{ fileKey: 'photos/x.jpg', width: 1, height: 1, caption: null, takenAt: null, tags: [] }],
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({ method: 'GET', url: `/api/collections/${id}`, headers: { authorization: `Bearer ${t}` } });
    expect(r.statusCode).toBe(200);
    expect(r.json().photos[0].thumbnailUrl).toContain('thumbnail/x800');
    await ctx.cleanup();
  });

  it('PATCH /:id updates title and tags', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'a', displayName: 'A', passwordHash: 'x' } });
    const id = await createCollection(ctx.prisma, u.id, {
      title: 'old', description: null, occurredOn: '2024-01-01', occurredUntil: null, location: null,
      tags: ['old'], photos: [{ fileKey: 'photos/x.jpg', width: 1, height: 1, caption: null, takenAt: null, tags: [] }],
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({ method: 'PATCH', url: `/api/collections/${id}`, headers: { authorization: `Bearer ${t}` }, payload: { title: 'new', tags: ['fresh'] } });
    expect(r.statusCode).toBe(200);
    expect(r.json().title).toBe('new');
    expect(r.json().tags.map((x:any)=>x.name)).toContain('fresh');
    await ctx.cleanup();
  });

  it('DELETE /:id removes db rows and storage files', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'a', displayName: 'A', passwordHash: 'x' } });
    const id = await createCollection(ctx.prisma, u.id, {
      title: 't', description: null, occurredOn: '2024-01-01', occurredUntil: null, location: null,
      tags: [], photos: [{ fileKey: 'photos/zap.jpg', width: 1, height: 1, caption: null, takenAt: null, tags: [] }],
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({ method: 'DELETE', url: `/api/collections/${id}`, headers: { authorization: `Bearer ${t}` } });
    expect(r.statusCode).toBe(204);
    expect(ctx.storage.deleted).toContain('photos/zap.jpg');
    expect(await ctx.prisma.collection.count()).toBe(0);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement in `src/routes/collections.ts`**

```typescript
import { CollectionUpdateInput } from '@daynest/shared';

// inside registerCollectionRoutes:
app.get('/api/collections/:id', { onRequest: [app.requireUser] }, async (req) => {
  const { id } = req.params as { id: string };
  try { return await buildCollectionDetail(app.deps.prisma, app.deps.storage, id); }
  catch { throw new AppError(404, 'NOT_FOUND', 'collection not found'); }
});

app.patch('/api/collections/:id', { onRequest: [app.requireUser] }, async (req) => {
  const { id } = req.params as { id: string };
  const parsed = CollectionUpdateInput.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
  const { tags, coverPhotoId, ...rest } = parsed.data;
  await app.deps.prisma.collection.update({
    where: { id },
    data: {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.description !== undefined ? { description: rest.description } : {}),
      ...(rest.occurredOn !== undefined ? { occurredOn: new Date(rest.occurredOn) } : {}),
      ...(rest.occurredUntil !== undefined ? { occurredUntil: rest.occurredUntil ? new Date(rest.occurredUntil) : null } : {}),
      ...(rest.location !== undefined ? { location: rest.location } : {}),
      ...(coverPhotoId ? { coverPhotoId } : {}),
    },
  });
  if (tags !== undefined) {
    const { upsertTags } = await import('../services/tags.js');
    const newTags = await upsertTags(app.deps.prisma, req.user.id, tags);
    await app.deps.prisma.collectionTag.deleteMany({ where: { collectionId: id } });
    if (newTags.length) {
      await app.deps.prisma.collectionTag.createMany({ data: newTags.map(t => ({ collectionId: id, tagId: t.id })) });
    }
  }
  return buildCollectionDetail(app.deps.prisma, app.deps.storage, id);
});

app.delete('/api/collections/:id', { onRequest: [app.requireUser] }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const photos = await app.deps.prisma.photo.findMany({ where: { collectionId: id }, select: { fileKey: true } });
  await app.deps.prisma.collection.update({ where: { id }, data: { coverPhotoId: null } });
  await app.deps.prisma.collection.delete({ where: { id } });
  await Promise.allSettled(photos.map(p => app.deps.storage.deleteObject(p.fileKey)));
  reply.status(204).send();
});
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(collections): GET / PATCH / DELETE endpoints"
```

---

## Task 18: Photo updates (caption, reorder, add/remove)

**Files:**
- Create: `apps/api/src/routes/photos.ts`
- Create: `apps/api/tests/photos.test.ts`

- [ ] **Step 1: TDD**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

describe('photos', () => {
  it('updates caption and tags', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'a', displayName: 'A', passwordHash: 'x' } });
    const id = await createCollection(ctx.prisma, u.id, {
      title: 't', description: null, occurredOn: '2024-01-01', occurredUntil: null, location: null,
      tags: [], photos: [{ fileKey: 'photos/p.jpg', width: 1, height: 1, caption: null, takenAt: null, tags: [] }],
    });
    const p = (await ctx.prisma.photo.findFirst({ where: { collectionId: id } }))!;
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({
      method: 'PATCH', url: `/api/photos/${p.id}`,
      headers: { authorization: `Bearer ${t}` },
      payload: { caption: '美丽', tags: ['美'] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().caption).toBe('美丽');
    expect(r.json().tags).toContain('美');
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement `src/routes/photos.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { upsertTags } from '../services/tags.js';

const Body = z.object({
  caption: z.string().max(2000).nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
});

export async function registerPhotoRoutes(app: FastifyInstance) {
  app.patch('/api/photos/:id', { onRequest: [app.requireUser] }, async (req) => {
    const { id } = req.params as { id: string };
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
    const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');
    await app.deps.prisma.photo.update({
      where: { id },
      data: {
        ...(parsed.data.caption !== undefined ? { caption: parsed.data.caption } : {}),
        ...(parsed.data.orderIndex !== undefined ? { orderIndex: parsed.data.orderIndex } : {}),
      },
    });
    if (parsed.data.tags !== undefined) {
      const newTags = await upsertTags(app.deps.prisma, req.user.id, parsed.data.tags);
      await app.deps.prisma.photoTag.deleteMany({ where: { photoId: id } });
      if (newTags.length) await app.deps.prisma.photoTag.createMany({ data: newTags.map(t => ({ photoId: id, tagId: t.id })) });
    }
    const updated = await app.deps.prisma.photo.findUnique({ where: { id }, include: { tags: { include: { tag: true } } } });
    return {
      id: updated!.id, collectionId: updated!.collectionId, fileKey: updated!.fileKey,
      width: updated!.width, height: updated!.height, caption: updated!.caption,
      takenAt: updated!.takenAt?.toISOString() ?? null, orderIndex: updated!.orderIndex,
      uploadedBy: updated!.uploadedById,
      thumbnailUrl: app.deps.storage.signThumbnail(updated!.fileKey, 800),
      tags: updated!.tags.map(pt => pt.tag.displayName),
    };
  });

  app.delete('/api/photos/:id', { onRequest: [app.requireUser] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const photo = await app.deps.prisma.photo.findUnique({ where: { id } });
    if (!photo) throw new AppError(404, 'NOT_FOUND', 'photo not found');
    await app.deps.prisma.photo.delete({ where: { id } });
    await app.deps.storage.deleteObject(photo.fileKey).catch(() => {});
    reply.status(204).send();
  });
}
```

- [ ] **Step 3: Register in server.ts + tests pass + commit**

```typescript
import { registerPhotoRoutes } from './routes/photos.js';
await registerPhotoRoutes(app);
```
```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(photos): PATCH caption/order/tags + DELETE photo"
```

---

## Task 19: Tags listing endpoint

**Files:**
- Create: `apps/api/src/routes/tags.ts`
- Create: `apps/api/tests/tagsRoute.test.ts`

- [ ] **Step 1: TDD**

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { signAccess } from '../src/auth/jwt.js';
import { createCollection } from '../src/services/collections.js';

describe('GET /api/tags', () => {
  it('returns tags with counts', async () => {
    const ctx = await buildApp();
    const u = await ctx.prisma.user.create({ data: { username: 'a', displayName: 'A', passwordHash: 'x' } });
    await createCollection(ctx.prisma, u.id, {
      title: 't1', description: null, occurredOn: '2024-01-01', occurredUntil: null, location: null,
      tags: ['樱花'], photos: [{ fileKey: 'p1.jpg', width: 1, height: 1, caption: null, takenAt: null, tags: ['日本'] }],
    });
    await createCollection(ctx.prisma, u.id, {
      title: 't2', description: null, occurredOn: '2024-02-01', occurredUntil: null, location: null,
      tags: ['樱花'], photos: [{ fileKey: 'p2.jpg', width: 1, height: 1, caption: null, takenAt: null, tags: [] }],
    });
    const t = await signAccess({ sub: u.id }, ctx.config.jwt.secret, 60);
    const r = await ctx.app.inject({ method: 'GET', url: '/api/tags', headers: { authorization: `Bearer ${t}` } });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    const sakura = body.find((t: any) => t.name === '樱花');
    expect(sakura.collectionCount).toBe(2);
    await ctx.cleanup();
  });
});
```

- [ ] **Step 2: Implement `src/routes/tags.ts`**

```typescript
import type { FastifyInstance } from 'fastify';

export async function registerTagRoutes(app: FastifyInstance) {
  app.get('/api/tags', { onRequest: [app.requireUser] }, async () => {
    const tags = await app.deps.prisma.tag.findMany({
      include: {
        _count: { select: { photos: true, collections: true } },
      },
    });
    return tags
      .map(t => ({
        id: t.id, name: t.name, displayName: t.displayName,
        photoCount: t._count.photos, collectionCount: t._count.collections,
      }))
      .sort((a, b) => (b.collectionCount + b.photoCount) - (a.collectionCount + a.photoCount));
  });
}
```

- [ ] **Step 3: Register in server.ts + tests + commit**

```typescript
import { registerTagRoutes } from './routes/tags.js';
await registerTagRoutes(app);
```
```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(tags): GET /api/tags with usage counts"
```

---

## Task 20: Seed script + CORS + helmet wiring

**Files:**
- Create: `apps/api/scripts/seed.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: `scripts/seed.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password.js';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();
const username = process.env.SEED_USERNAME ?? 'admin';
const displayName = process.env.SEED_DISPLAY_NAME ?? 'Admin';
const password = process.env.SEED_PASSWORD ?? randomBytes(8).toString('base64url');

async function main() {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`[seed] user "${username}" already exists; nothing to do.`);
    return;
  }
  const user = await prisma.user.create({
    data: { username, displayName, passwordHash: await hashPassword(password) },
  });
  console.log(`[seed] created user "${username}" id=${user.id}`);
  console.log(`[seed] password: ${password}`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Update `src/server.ts` to wire CORS + helmet**

```typescript
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
// inside buildServer, before plugins:
await app.register(helmet, { contentSecurityPolicy: false });
if (deps) {
  await app.register(cors, {
    origin: deps.config.corsOrigin === '*' ? true : deps.config.corsOrigin.split(',').map(s => s.trim()),
    credentials: true,
  });
}
```

- [ ] **Step 3: Update `src/index.ts` to wire prod deps**

```typescript
import { buildServer } from './server.js';
import { loadConfig } from './config.js';
import { getPrisma } from './db.js';
import { QiniuStorage } from './storage/qiniu.js';

const config = loadConfig();
const prisma = getPrisma();
const storage = new QiniuStorage({
  accessKey: config.qiniu.accessKey,
  secretKey: config.qiniu.secretKey,
  bucket: config.qiniu.bucket,
  domain: config.qiniu.domain,
  zone: config.qiniu.zone,
});

const app = await buildServer(
  {
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: config.env === 'production' ? undefined : { target: 'pino-pretty' },
    },
  },
  { config, prisma, storage }
);

await app.listen({ port: config.port, host: '0.0.0.0' });
```

- [ ] **Step 4: Tests still pass + commit**

```bash
pnpm --filter @daynest/api test
git add -A && git commit -m "feat(api): cors + helmet + seed script + prod entrypoint"
```

---

## Task 21: Smoke test the running server

**Files:** (no new files; verification step)

- [ ] **Step 1: Build everything**

```bash
pnpm --filter @daynest/shared build
pnpm --filter @daynest/api build
```

- [ ] **Step 2: Run migration**

```bash
DATABASE_URL='file:./dev.db' pnpm --filter @daynest/api exec prisma migrate deploy
```

- [ ] **Step 3: Seed and start server (with fake env to verify wiring)**

```bash
cd apps/api
SEED_PASSWORD=test-pass-123 \
DATABASE_URL='file:./dev.db' \
JWT_SECRET='dev-jwt-secret-dev-jwt-secret-dev-jwt' \
JWT_REFRESH_SECRET='dev-refresh-secret-dev-refresh-secret' \
QINIU_ACCESS_KEY=placeholder QINIU_SECRET_KEY=placeholder \
QINIU_BUCKET=placeholder QINIU_DOMAIN=https://placeholder.com \
pnpm seed
```
Expected: prints user created with id and password.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```
Expected: all green.

- [ ] **Step 5: Commit any final adjustments**

```bash
git add -A && (git diff --cached --quiet || git commit -m "chore: final backend test pass")
```

---

## Self-Review Notes

- Spec → Plan coverage:
  - §3 User permissions → Tasks 7-13 (auth flow + invites)
  - §4.4 Qiniu storage → Tasks 6, 13
  - §5 Domain model → Task 4 (Prisma schema)
  - §6 Routes → Tasks 10-19 (all `/api/*` endpoints required by FE)
  - §9.1 upload flow → Task 13 + Task 15 (token issuance + transactional create)
  - §9.2 timeline pagination → Task 16
  - §9.3 pinboard data → Task 16 (tag filter) + Task 19 (tag list)
  - §10 security → Tasks 7-9 (argon2, JWT TTLs, requireUser)
  - §12 risks → backend abstraction in Task 6 (StorageProvider)

- DTOs in `@daynest/shared` align between request validation and response shapes. Names match (`CollectionCreateInput`, `CollectionDetailDTO`, etc.).

- Test fixtures (`buildApp`) provide isolated DB + fake storage, allowing fast unit-style integration tests.
