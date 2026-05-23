# Mini-Program v1 — Plan 05 · Upload Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Tasks use `- [ ]` checkboxes.

**Goal:** Ship the write side of the mini-program — let the user create a new collection (or append to an existing one) by picking photos from their album, reading EXIF for sensible defaults, client-side-compressing, uploading directly to Qiniu with bounded concurrency, then committing the collection metadata to the api.

**Why this is the heaviest plan in the series:** uploads need to handle the full pipeline (pick → exif → compress → token → direct-to-Qiniu → commit), parallel scheduling with progress UI, and graceful failure handling. Plus a tag picker and a fuzzy collection-title merge prompt. Backend is already complete — `POST /api/uploads/token` mints Qiniu tokens, `POST /api/collections` commits new collections, `POST /api/collections/:id/append` adds to existing ones, `GET /api/collections/by-title` fuzzy-matches. We add only the miniapp client.

**Architecture:**
- **Upload draft** lives in a new `uploadStore` (zustand-style) — selected photos with per-photo status (`queued` / `compressing` / `uploading` / `done` / `failed`), overall progress, draft metadata (title, description, location, tags, occurredOn).
- **Per-photo pipeline** is a generator: pick → read EXIF (from original) → compress to ≤1600px-long-edge JPEG q75 → request a Qiniu upload token → `wx.uploadFile` to Qiniu → record `fileKey` + Qiniu-returned width/height. EXIF and compress steps run in series per photo (compress mutates the temp path); the token+upload step is parallel-bounded by an `uploadQueue` with concurrency **10**.
- **Title fuzzy merge:** as the user types the title, a debounced `GET /api/collections/by-title?title=...` surfaces matches. If the user picks one, the submit path switches from `POST /api/collections` to `POST /api/collections/:id/append`.
- **Visual flow:** single page `pkgUpload/new/index` hosts the picker, the metadata form, the progress sheet, and the submit button. No separate progress page — keeps the user in context.

**Tech Stack:** Native WXML/WXSS/JS · TypeScript · Vitest · `@daynest/shared` DTOs · existing Plan 02+03+04 infra (`createApiClient`, `authStore`, `themeStore`, `collectionsService`, `tagsService`, `_http.ts`, `wxBridge`, `_client.ts`).

**Companion spec:** [`../specs/2026-05-22-miniapp-design.md`](../specs/2026-05-22-miniapp-design.md) — §3.3 (upload page tree), §4.6 (upload pipeline), §5.2 (write-side wire contracts).

**Backend dependency** (already on `main`, no changes required this plan):
- `POST /api/uploads/token` body `{ ext, count, collectionDraftId? }` → `{ tokens: [{ token, key, uploadUrl, expiresAt }, ...] }`
- `POST /api/collections` body `CollectionCreateInput` → `CollectionDetailDTO`
- `POST /api/collections/:id/append` body `CollectionAppendInput` → `CollectionDetailDTO`
- `GET /api/collections/by-title?title=...` → `{ collection: CollectionDetailDTO | null, directTags: string[], matches: Array<{ collection, directTags, score, matchType }> }`
- `GET /api/tags` (for autocomplete)

Qiniu form upload contract (already used by the web client — see `apps/web/src/lib/uploads.ts`):
- POST `multipart/form-data` to `uploadUrl`
- Fields: `token` (the upload token), `key` (the file key), `file` (the binary content)
- Response (success): `200` JSON `{ key, hash, size, width, height }` (the `returnBody` template configured in `apps/api/src/storage/qiniu.ts:43-49`)

**Scope of this plan:**
- ✅ `lib/exif.ts` — minimal JPEG EXIF parser for `DateTimeOriginal` (the only field needed)
- ✅ `lib/imageCompress.ts` — `wx.compressImage` wrapper
- ✅ `lib/uploadQueue.ts` — concurrency-bounded promise scheduler
- ✅ `services/uploads.ts` — `uploadsService.requestTokens()` + `uploadsService.toQiniu(token)`
- ✅ `services/collections.ts` extensions — `create`, `append`, `byTitle`
- ✅ `stores/uploadStore.ts` — per-photo state + overall progress
- ✅ `components/tag-picker/index` — chip-based tag input with autocomplete
- ✅ `pkgUpload/` subpackage + app.json preload from `pages/timeline/index`
- ✅ `pkgUpload/new/index` — composition page (picker, form, fuzzy match, progress, submit)
- ✅ Timeline `+` FAB → `pkgUpload/new/index`
- ✅ Cross-package E2E smoke test (`apps/api/tests/wechat/miniapp-upload.test.ts`)

**Out of scope (deferred to Plan 06):**
- ❌ Subscribe-message prompts at favorite-time
- ❌ Settings page (`displayName` edit, WeChat unbind)
- ❌ Invites page
- ❌ `onShareAppMessage` share cards
- ❌ Real fonts / final QA polish
- ❌ Edit-existing-collection flow (Plan 04's tag rename + this plan's upload-append cover most needs; full edit is a Plan 07 concern)

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `apps/miniapp/miniprogram/lib/exif.ts` | Tiny EXIF reader (DateTimeOriginal only) |
| `apps/miniapp/tests/lib/exif.test.ts` | EXIF tests using small JPEG fixtures |
| `apps/miniapp/miniprogram/lib/imageCompress.ts` | `wx.compressImage` wrapper |
| `apps/miniapp/tests/lib/imageCompress.test.ts` | imageCompress tests |
| `apps/miniapp/miniprogram/lib/uploadQueue.ts` | Concurrency-bounded promise scheduler |
| `apps/miniapp/tests/lib/uploadQueue.test.ts` | Queue tests |
| `apps/miniapp/miniprogram/lib/services/uploads.ts` | Token + Qiniu upload service |
| `apps/miniapp/tests/lib/services/uploads.test.ts` | uploads tests |
| `apps/miniapp/tests/lib/services/collections.write.test.ts` | tests for create/append/byTitle |
| `apps/miniapp/miniprogram/stores/uploadStore.ts` | Global upload draft + queue state |
| `apps/miniapp/tests/stores/uploadStore.test.ts` | uploadStore tests |
| `apps/miniapp/miniprogram/components/tag-picker/index.{ts,wxml,wxss,json}` | Tag autocomplete component |
| `apps/miniapp/tests/components/tag-picker.test.ts` | tag-picker unit tests |
| `apps/miniapp/miniprogram/pkgUpload/new/index.{ts,wxml,wxss,json}` | Upload composition page |
| `apps/api/tests/wechat/miniapp-upload.test.ts` | Cross-package E2E smoke test |
| `apps/miniapp/tests/fixtures/exif-2024-01-15.jpg.base64` | Base64-encoded JPEG fixture with EXIF |

### Modified files

| Path | Change |
|---|---|
| `apps/miniapp/miniprogram/lib/services/collections.ts` | Add `create`, `append`, `byTitle` methods |
| `apps/miniapp/miniprogram/app.json` | Register `pkgUpload` subpackage + wifi preload |
| `apps/miniapp/miniprogram/pages/timeline/index.wxml` | Add `+` FAB |
| `apps/miniapp/miniprogram/pages/timeline/index.wxss` | FAB styles |
| `apps/miniapp/miniprogram/pages/timeline/index.ts` | FAB tap → navigate to upload |
| `apps/api/tsconfig.json` | Add `tests/wechat/miniapp-upload.test.ts` to `exclude` |

### Files NOT touched
- `apps/api/src/**` — backend frozen for Plan 05
- `packages/shared/src/**` — no DTO additions (reuse existing `CollectionCreateInput` / `CollectionAppendInput` / `PhotoInput`)
- Plan 02/03/04 pages and components — reused as-is

---

## Conventions

- **TDD** for `exif`, `imageCompress`, `uploadQueue`, services, `uploadStore`, and `tag-picker`.
- **Test commands:** `pnpm --filter @daynest/miniapp test`, `pnpm --filter @daynest/api test`.
- **Typecheck:** `pnpm --filter @daynest/miniapp build` (uses `tsc -p .`).
- **API access discipline:** pages call services, never `apiClient.request` directly.
- **WXSS units:** `rpx` only (except `1px` hairlines and `100vh`).
- **Commits:** Conventional Commits (`feat(miniapp):`, `test(miniapp):`).
- **Baseline before starting Plan 05:** miniapp **74** / api **167** / shared **22** passing; tsc clean across all three.

---

## Task 1: `lib/exif.ts` minimal EXIF parser

**Files:** Create `apps/miniapp/miniprogram/lib/exif.ts` + `apps/miniapp/tests/lib/exif.test.ts` + the JPEG fixture.

**Goal:** Read `DateTimeOriginal` from a JPEG's EXIF segment without pulling a third-party library. The mini-program can read a file's raw bytes via `wx.getFileSystemManager().readFile({ filePath })`, returning an `ArrayBuffer`. We parse the EXIF APP1 marker by hand — only need ~150 lines.

### Algorithm

1. Verify SOI marker `0xFFD8` (JPEG).
2. Walk the segments looking for APP1 (`0xFFE1`) starting with the `Exif\0\0` magic.
3. Inside the TIFF block: read byte order (`II` little-endian or `MM` big-endian), read IFD0, find the `ExifOffset` tag (0x8769), jump to ExifIFD, find tag 0x9003 (`DateTimeOriginal`), read the ASCII value (19 bytes, format `YYYY:MM:DD HH:MM:SS`).
4. Convert to ISO 8601 (`YYYY-MM-DDTHH:MM:SS`).
5. Any parse failure returns `null` — never throw.

### Public API

```typescript
export interface ExifInfo {
  dateTimeOriginal: string | null;  // ISO 8601 or null
}

/** Parse EXIF from a JPEG's first ~64KB. Returns null fields on any failure. */
export function parseExif(buf: ArrayBuffer): ExifInfo;

/** Convenience wrapper: read first 64KB from a wx temp file path. */
export function readExifFromPath(filePath: string): Promise<ExifInfo>;
```

- [ ] **Step 1: Create the fixture**

The fixture is a small JPEG with a known `DateTimeOriginal` of `2024:01:15 10:30:00`. Generate it once with a Node script and check in the base64. Put it under `apps/miniapp/tests/fixtures/exif-2024-01-15.jpg.base64`. In `exif.test.ts`, decode the base64 to an ArrayBuffer.

To generate the fixture, run this Node one-liner once and save the output to the fixture path:

```bash
cd /Users/bytedance/work/ai/day_nest
node -e "
const fs = require('fs');
// Minimal JPEG: SOI + APP1(EXIF) + DateTimeOriginal + SOS (no image data needed for our parser)
const dateStr = '2024:01:15 10:30:00';
const dateBytes = Buffer.from(dateStr + '\0', 'ascii'); // 20 bytes
const tiff = Buffer.concat([
  Buffer.from('II', 'ascii'),                                    // little-endian
  Buffer.from([0x2A, 0x00]),                                     // magic 42
  Buffer.from([0x08, 0x00, 0x00, 0x00]),                         // IFD0 offset = 8
  // IFD0: 1 entry (ExifOffset)
  Buffer.from([0x01, 0x00]),                                     // 1 entry
  Buffer.from([0x69, 0x87, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00,   // tag 0x8769, type LONG, count 1
                0x1A, 0x00, 0x00, 0x00]),                        // value = offset 26 (where ExifIFD starts)
  Buffer.from([0x00, 0x00, 0x00, 0x00]),                         // next IFD offset = 0
  // ExifIFD at offset 26: count(2) + 1 entry(12) + next(4) = 18 bytes,
  //   so dateBytes land at TIFF base + 26 + 18 = TIFF+44.
  Buffer.from([0x01, 0x00]),                                     // 1 entry
  Buffer.from([0x03, 0x90, 0x02, 0x00, 0x14, 0x00, 0x00, 0x00,   // tag 0x9003, type ASCII, count 20
                0x2C, 0x00, 0x00, 0x00]),                        // value offset = 44
  Buffer.from([0x00, 0x00, 0x00, 0x00]),                         // next IFD offset
  dateBytes,                                                     // 20 bytes ASCII date
]);
const exifPayload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
const app1Length = Buffer.alloc(2);
app1Length.writeUInt16BE(exifPayload.length + 2, 0);  // +2 for the length bytes themselves
const jpg = Buffer.concat([
  Buffer.from([0xFF, 0xD8]),                                     // SOI
  Buffer.from([0xFF, 0xE1]),                                     // APP1
  app1Length,
  exifPayload,
  Buffer.from([0xFF, 0xD9]),                                     // EOI
]);
fs.writeFileSync('apps/miniapp/tests/fixtures/exif-2024-01-15.jpg.base64', jpg.toString('base64'));
console.log('wrote ' + jpg.length + ' bytes');
"
```

- [ ] **Step 2: Write the failing test**

`apps/miniapp/tests/lib/exif.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseExif } from '../../miniprogram/lib/exif.js';

function loadFixture(name: string): ArrayBuffer {
  const b64 = readFileSync(
    resolve(__dirname, '../fixtures/' + name + '.base64'),
    'utf8',
  ).trim();
  const bytes = Buffer.from(b64, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('parseExif', () => {
  it('returns null fields for non-JPEG input', () => {
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(parseExif(buf).dateTimeOriginal).toBeNull();
  });

  it('returns null fields for a JPEG with no EXIF', () => {
    const buf = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]).buffer;
    expect(parseExif(buf).dateTimeOriginal).toBeNull();
  });

  it('reads DateTimeOriginal from a JPEG with a populated EXIF block', () => {
    const buf = loadFixture('exif-2024-01-15.jpg');
    const info = parseExif(buf);
    expect(info.dateTimeOriginal).toBe('2024-01-15T10:30:00');
  });

  it('does not throw on truncated input', () => {
    const buf = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10]).buffer;
    expect(() => parseExif(buf)).not.toThrow();
    expect(parseExif(buf).dateTimeOriginal).toBeNull();
  });
});
```

- [ ] **Step 3: Run — must fail**

```bash
pnpm --filter @daynest/miniapp test
```

Expected: `exif.test.ts` fails with `Cannot find module '.../lib/exif.js'`.

- [ ] **Step 4: Create `apps/miniapp/miniprogram/lib/exif.ts`**

```typescript
/**
 * Tiny EXIF reader. Extracts only DateTimeOriginal (tag 0x9003) from a JPEG
 * APP1 segment. Designed to be small and robust — any parse error returns
 * a sentinel { dateTimeOriginal: null } rather than throwing. Heavy lifting
 * libraries like exifr are too large for a mini-program bundle.
 */

export interface ExifInfo {
  dateTimeOriginal: string | null;
}

const EXIF_NULL: ExifInfo = { dateTimeOriginal: null };

export function parseExif(buf: ArrayBuffer): ExifInfo {
  try {
    const view = new DataView(buf);
    // SOI marker
    if (buf.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return EXIF_NULL;
    // Walk segments to find APP1 (0xFFE1) with "Exif\0\0" magic
    let offset = 2;
    while (offset < buf.byteLength - 8) {
      if (view.getUint8(offset) !== 0xFF) return EXIF_NULL;
      const marker = view.getUint8(offset + 1);
      const segLen = view.getUint16(offset + 2);
      if (marker === 0xDA /* SOS */ || marker === 0xD9 /* EOI */) return EXIF_NULL;
      if (marker === 0xE1) {
        const magic = readAscii(view, offset + 4, 6);
        if (magic === 'Exif\0\0') {
          return parseTiff(buf, offset + 10, segLen - 8);
        }
      }
      offset += 2 + segLen;
    }
    return EXIF_NULL;
  } catch {
    return EXIF_NULL;
  }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

function parseTiff(buf: ArrayBuffer, tiffOffset: number, _maxLen: number): ExifInfo {
  try {
    const view = new DataView(buf);
    const order = view.getUint16(tiffOffset);
    const little = order === 0x4949; // 'II'
    if (!little && order !== 0x4D4D /* 'MM' */) return EXIF_NULL;
    const u16 = (off: number) => view.getUint16(off, little);
    const u32 = (off: number) => view.getUint32(off, little);
    if (u16(tiffOffset + 2) !== 0x002A) return EXIF_NULL;
    const ifd0Offset = tiffOffset + u32(tiffOffset + 4);

    // Walk IFD0 to find ExifOffset (0x8769)
    const exifOffset = findTagValue(view, ifd0Offset, 0x8769, u16, u32);
    if (exifOffset === null) return EXIF_NULL;
    const exifIfdOffset = tiffOffset + exifOffset;

    // Walk ExifIFD to find DateTimeOriginal (0x9003) — ASCII, 20 bytes incl. null
    const dtoOffset = findTagValue(view, exifIfdOffset, 0x9003, u16, u32);
    if (dtoOffset === null) return EXIF_NULL;
    const raw = readAscii(view, tiffOffset + dtoOffset, 19); // "YYYY:MM:DD HH:MM:SS"
    return { dateTimeOriginal: formatExifDate(raw) };
  } catch {
    return EXIF_NULL;
  }
}

/**
 * Find a tag in an IFD and return its 32-bit value. Only handles tags whose
 * value is itself a 32-bit offset (ExifOffset) or a small ASCII whose offset
 * is stored in the value slot. Returns the value-slot interpretation as a
 * uint32; callers interpret it as an offset relative to the TIFF base.
 */
function findTagValue(
  view: DataView,
  ifdOffset: number,
  targetTag: number,
  u16: (off: number) => number,
  u32: (off: number) => number,
): number | null {
  const count = u16(ifdOffset);
  for (let i = 0; i < count; i++) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = u16(entry);
    if (tag === targetTag) {
      return u32(entry + 8);
    }
  }
  return null;
}

function formatExifDate(raw: string): string | null {
  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/**
 * Read up to 64KB from a wx temp file path and parse EXIF from it. Returns
 * a sentinel { dateTimeOriginal: null } on any I/O or parse failure. This
 * wrapper is only used at runtime in the mini-program (the unit tests call
 * parseExif directly with a fixture).
 */
export function readExifFromPath(filePath: string): Promise<ExifInfo> {
  return new Promise((resolveOk) => {
    try {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath,
        position: 0,
        length: 65536,
        success: (res) => {
          const data = res.data;
          const buf = typeof data === 'string'
            ? new TextEncoder().encode(data).buffer
            : data;
          resolveOk(parseExif(buf as ArrayBuffer));
        },
        fail: () => resolveOk(EXIF_NULL),
      });
    } catch {
      resolveOk(EXIF_NULL);
    }
  });
}
```

- [ ] **Step 5: Run — must pass**

Expected: prior **74** + 4 new = **78**.

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/lib/exif.ts apps/miniapp/tests/lib/exif.test.ts apps/miniapp/tests/fixtures/exif-2024-01-15.jpg.base64
git commit -m "feat(miniapp): tiny JPEG EXIF reader for DateTimeOriginal"
```

---

## Task 2: `lib/imageCompress.ts` — wx.compressImage wrapper

**Files:** Create `apps/miniapp/miniprogram/lib/imageCompress.ts` + `apps/miniapp/tests/lib/imageCompress.test.ts`.

`wx.compressImage` is sync to call (callback-style) and outputs a compressed JPEG temp file. Wrap it in a promise and add a max-dimension argument (we cap at 1600px long-edge for v1).

### Public API

```typescript
export interface CompressResult {
  tempFilePath: string;
  width: number;
  height: number;
}

export function compressImage(opts: {
  src: string;
  longEdge?: number;   // default 1600
  quality?: number;    // 0-100, default 75
}): Promise<CompressResult>;
```

The implementation calls `wx.getImageInfo` first (to know the source dimensions), computes a scale-down target, then `wx.compressImage({ src, quality, compressedWidth, compressedHeight })`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { compressImage } from '../../miniprogram/lib/imageCompress.js';

declare global {
  // augment the wxMock helper interface with image-related queues
  interface WxMockHooks {
    queueImageInfo(res: { width: number; height: number }): void;
    queueCompressResult(res: { tempFilePath: string }): void;
  }
}

describe('compressImage', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
  });
  afterEach(() => uninstallWxMock());

  it('uses long-edge target when source is wider than tall', async () => {
    (mock as unknown as WxMockHooks).queueImageInfo({ width: 4000, height: 3000 });
    (mock as unknown as WxMockHooks).queueCompressResult({ tempFilePath: 'wxfile://compressed.jpg' });
    const out = await compressImage({ src: 'wxfile://src.jpg', longEdge: 1600, quality: 75 });
    expect(out.tempFilePath).toBe('wxfile://compressed.jpg');
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
  });

  it('uses long-edge target on the height when source is portrait', async () => {
    (mock as unknown as WxMockHooks).queueImageInfo({ width: 3000, height: 4000 });
    (mock as unknown as WxMockHooks).queueCompressResult({ tempFilePath: 'wxfile://compressed2.jpg' });
    const out = await compressImage({ src: 'wxfile://src.jpg' });
    expect(out.width).toBe(1200);
    expect(out.height).toBe(1600);
  });

  it('does not upscale: returns the source dimensions when smaller than long-edge', async () => {
    (mock as unknown as WxMockHooks).queueImageInfo({ width: 800, height: 600 });
    (mock as unknown as WxMockHooks).queueCompressResult({ tempFilePath: 'wxfile://compressed3.jpg' });
    const out = await compressImage({ src: 'wxfile://src.jpg' });
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });

  it('rejects when wx.compressImage fails', async () => {
    (mock as unknown as WxMockHooks).queueImageInfo({ width: 1000, height: 1000 });
    // queue NO compress result so the wxMock's default fail kicks in
    await expect(compressImage({ src: 'wxfile://src.jpg' })).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Extend `tests/helpers/wxMock.ts`**

Add `imageInfoQueue` and `compressQueue` plus `getImageInfo` and `compressImage` handlers. Append to the existing harness:

```typescript
// Add to WxMockOptions: no change needed
// Add inside installWxMock, near the request handler:

  const imageInfoQueue: Array<{ width: number; height: number }> = [];
  const compressQueue: Array<{ tempFilePath: string }> = [];

  Object.assign(wx, {
    getImageInfo: (o: { src: string; success?: (r: { width: number; height: number }) => void; fail?: (e: unknown) => void }) => {
      const next = imageInfoQueue.shift();
      if (!next) { o.fail?.(new Error('no queued image info')); return; }
      Promise.resolve().then(() => o.success?.(next));
    },
    compressImage: (o: { src: string; quality?: number; compressedWidth?: number; compressedHeight?: number; success?: (r: { tempFilePath: string }) => void; fail?: (e: unknown) => void }) => {
      const next = compressQueue.shift();
      if (!next) { o.fail?.(new Error('no queued compress result')); return; }
      Promise.resolve().then(() => o.success?.(next));
    },
  });

  // Extend the returned WxMock with the new queueing helpers
  return {
    // ... existing fields ...
    queueImageInfo: (r: { width: number; height: number }) => { imageInfoQueue.push(r); },
    queueCompressResult: (r: { tempFilePath: string }) => { compressQueue.push(r); },
  };
```

And update the `WxMock` interface to declare the two new helpers as required:

```typescript
export interface WxMock {
  // ... existing fields ...
  queueImageInfo(r: { width: number; height: number }): void;
  queueCompressResult(r: { tempFilePath: string }): void;
}
```

(The test casts via `WxMockHooks` were a workaround for an interface that didn't yet exist; once the helper's real interface includes the methods, drop the casts.)

After the `WxMock` interface update, simplify the test file to drop the casts — the methods are reachable directly on `mock`.

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/imageCompress.ts`**

```typescript
export interface CompressResult {
  tempFilePath: string;
  width: number;
  height: number;
}

interface CompressOpts {
  src: string;
  longEdge?: number;
  quality?: number;
}

const DEFAULT_LONG_EDGE = 1600;
const DEFAULT_QUALITY = 75;

export function compressImage(opts: CompressOpts): Promise<CompressResult> {
  const longEdge = opts.longEdge ?? DEFAULT_LONG_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  return new Promise((resolveOk, reject) => {
    wx.getImageInfo({
      src: opts.src,
      success: (info) => {
        const { width, height } = scale(info.width, info.height, longEdge);
        wx.compressImage({
          src: opts.src,
          quality,
          compressedWidth: width,
          compressedHeight: height,
          success: (r) => resolveOk({
            tempFilePath: r.tempFilePath,
            width,
            height,
          }),
          fail: reject,
        });
      },
      fail: reject,
    });
  });
}

function scale(srcW: number, srcH: number, longEdge: number): { width: number; height: number } {
  const long = Math.max(srcW, srcH);
  if (long <= longEdge) return { width: srcW, height: srcH };
  const ratio = longEdge / long;
  return {
    width: Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  };
}
```

- [ ] **Step 4: Run — must pass**

Expected: 78 + 4 = **82**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/imageCompress.ts apps/miniapp/tests/lib/imageCompress.test.ts apps/miniapp/tests/helpers/wxMock.ts
git commit -m "feat(miniapp): compressImage wrapper with long-edge cap + no-upscale"
```

---

## Task 3: `lib/uploadQueue.ts` — concurrency-bounded scheduler

**Files:** Create `apps/miniapp/miniprogram/lib/uploadQueue.ts` + `apps/miniapp/tests/lib/uploadQueue.test.ts`.

A simple bounded-concurrency promise scheduler: `enqueue(task)` returns the task's resolved value; at most `concurrency` tasks run concurrently; failed tasks reject the corresponding `enqueue` call but do NOT halt the rest. No retry logic (the caller decides). Cancellation is by abort signal (optional — defer to per-call use; the queue itself doesn't expose cancel).

### Public API

```typescript
export interface UploadQueueOptions {
  concurrency: number;  // max in-flight
}

export interface UploadQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  inFlight(): number;
  pending(): number;
}

export function createUploadQueue(opts: UploadQueueOptions): UploadQueue;
```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createUploadQueue } from '../../miniprogram/lib/uploadQueue.js';

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

describe('createUploadQueue', () => {
  it('runs at most N tasks concurrently', async () => {
    const q = createUploadQueue({ concurrency: 2 });
    let peak = 0;
    let current = 0;
    const task = async () => {
      current++;
      peak = Math.max(peak, current);
      await tick(20);
      current--;
      return 'ok';
    };
    await Promise.all([q.enqueue(task), q.enqueue(task), q.enqueue(task), q.enqueue(task), q.enqueue(task)]);
    expect(peak).toBe(2);
  });

  it('returns each task\'s resolved value', async () => {
    const q = createUploadQueue({ concurrency: 3 });
    const values = await Promise.all(
      [1, 2, 3, 4].map((n) => q.enqueue(async () => n * 10)),
    );
    expect(values).toEqual([10, 20, 30, 40]);
  });

  it('rejects per-task without halting the queue', async () => {
    const q = createUploadQueue({ concurrency: 2 });
    const results = await Promise.allSettled([
      q.enqueue(async () => { throw new Error('boom'); }),
      q.enqueue(async () => 'ok'),
      q.enqueue(async () => 'ok2'),
    ]);
    expect(results[0]!.status).toBe('rejected');
    expect(results[1]!.status).toBe('fulfilled');
    expect(results[2]!.status).toBe('fulfilled');
  });

  it('reports in-flight and pending counts during execution', async () => {
    const q = createUploadQueue({ concurrency: 2 });
    let release: (() => void) | null = null;
    const blocker = new Promise<void>((r) => { release = r; });
    const blocked = () => blocker.then(() => 'done');
    const p1 = q.enqueue(blocked);
    const p2 = q.enqueue(blocked);
    const p3 = q.enqueue(blocked);
    await tick();
    expect(q.inFlight()).toBe(2);
    expect(q.pending()).toBe(1);
    release!();
    await Promise.all([p1, p2, p3]);
    expect(q.inFlight()).toBe(0);
    expect(q.pending()).toBe(0);
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/uploadQueue.ts`**

```typescript
export interface UploadQueueOptions {
  concurrency: number;
}

export interface UploadQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  inFlight(): number;
  pending(): number;
}

interface Job {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export function createUploadQueue(opts: UploadQueueOptions): UploadQueue {
  const concurrency = Math.max(1, opts.concurrency);
  let active = 0;
  const waiting: Job[] = [];

  const drain = () => {
    while (active < concurrency && waiting.length > 0) {
      const job = waiting.shift()!;
      active++;
      // NOTE: decrement active and drain BEFORE resolve/reject. Using
      // `.finally(active--)` would run the cleanup after the consumer's
      // `await enqueue(...)` resumes, leaving `inFlight()` stale for one
      // microtask — which the "reports in-flight and pending counts"
      // test would catch.
      job.run().then(
        (v) => {
          active--;
          drain();
          job.resolve(v);
        },
        (e) => {
          active--;
          drain();
          job.reject(e);
        },
      );
    }
  };

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push({
          run: task as () => Promise<unknown>,
          resolve: resolve as (v: unknown) => void,
          reject,
        });
        drain();
      });
    },
    inFlight: () => active,
    pending: () => waiting.length,
  };
}
```

- [ ] **Step 4: Run — must pass**

Expected: 82 + 4 = **86**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/uploadQueue.ts apps/miniapp/tests/lib/uploadQueue.test.ts
git commit -m "feat(miniapp): bounded-concurrency promise queue for parallel uploads"
```

---

## Task 4: `services/uploads.ts` — token + Qiniu upload service

**Files:** Create `apps/miniapp/miniprogram/lib/services/uploads.ts` + `apps/miniapp/tests/lib/services/uploads.test.ts`.

The service wraps two operations:
1. `requestTokens({ ext, count, collectionDraftId? })` → `POST /api/uploads/token` returning `UploadTokenBundle[]`
2. `uploadToQiniu({ token, key, uploadUrl, filePath })` → `wx.uploadFile` multipart POST to Qiniu, returns the Qiniu return-body (`{ key, hash, size, width, height }`)

### Public API

```typescript
export interface UploadTokenBundle {
  token: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface QiniuReturnBody {
  key: string;
  hash: string;
  size: number;
  width: number;
  height: number;
}

export const uploadsService = {
  requestTokens(opts: { ext: string; count: number; collectionDraftId?: string }): Promise<UploadTokenBundle[]>;
  uploadToQiniu(opts: { token: string; key: string; uploadUrl: string; filePath: string }): Promise<QiniuReturnBody>;
};
```

- [ ] **Step 1: Write the failing test**

Tests use the existing wxMock + a NEW `queueUploadFile` helper. Extend `tests/helpers/wxMock.ts` analogously to Task 2 to handle `wx.uploadFile`:

```typescript
  const uploadQueueResults: Array<{ statusCode: number; data: string }> = [];
  Object.assign(wx, {
    uploadFile: (o: { url: string; filePath: string; name: string; formData: Record<string, string>; success?: (r: { statusCode: number; data: string }) => void; fail?: (e: unknown) => void }) => {
      const next = uploadQueueResults.shift();
      if (!next) { o.fail?.(new Error('no queued uploadFile result')); return { abort: () => undefined }; }
      Promise.resolve().then(() => o.success?.(next));
      return { abort: () => undefined };
    },
  });

  return {
    // ... existing fields ...
    queueUploadFile: (r: { statusCode: number; data: string }) => { uploadQueueResults.push(r); },
    uploadFileCalls: [] as Array<{ url: string; filePath: string; name: string; formData: Record<string, string> }>,
  };
```

Also capture the call args (like the existing `requests` array does). Modify the `uploadFile` handler:

```typescript
    uploadFile: (o) => {
      uploadFileCalls.push({ url: o.url, filePath: o.filePath, name: o.name, formData: o.formData });
      // ... rest as above
    },
```

And add `uploadFileCalls` to the returned object.

Test file `apps/miniapp/tests/lib/services/uploads.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { uploadsService } from '../../../miniprogram/lib/services/uploads.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('uploadsService.requestTokens', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('POSTs to /api/uploads/token with the body', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        tokens: [
          { token: 't1', key: 'k1.jpg', uploadUrl: 'https://up.q.io', expiresAt: '2026-12-31T00:00:00Z' },
          { token: 't2', key: 'k2.jpg', uploadUrl: 'https://up.q.io', expiresAt: '2026-12-31T00:00:00Z' },
        ],
      },
    });
    const out = await uploadsService.requestTokens({ ext: 'jpg', count: 2 });
    expect(out.length).toBe(2);
    expect(out[0]?.token).toBe('t1');
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/uploads\/token$/);
    expect(req?.data).toEqual({ ext: 'jpg', count: 2 });
  });

  it('passes collectionDraftId when given', async () => {
    mock.queueResponse({ statusCode: 200, data: { tokens: [] } });
    await uploadsService.requestTokens({ ext: 'jpg', count: 1, collectionDraftId: 'draft-123' });
    expect(mock.requests[0]?.data).toEqual({ ext: 'jpg', count: 1, collectionDraftId: 'draft-123' });
  });
});

describe('uploadsService.uploadToQiniu', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('multipart POSTs to the upload URL with token + key + file field', async () => {
    mock.queueUploadFile({
      statusCode: 200,
      data: JSON.stringify({ key: 'k1.jpg', hash: 'abc', size: 12345, width: 1600, height: 1200 }),
    });
    const out = await uploadsService.uploadToQiniu({
      token: 't1', key: 'k1.jpg', uploadUrl: 'https://up.q.io', filePath: 'wxfile://x.jpg',
    });
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    const call = mock.uploadFileCalls[0];
    expect(call?.url).toBe('https://up.q.io');
    expect(call?.name).toBe('file');
    expect(call?.formData).toEqual({ token: 't1', key: 'k1.jpg' });
    expect(call?.filePath).toBe('wxfile://x.jpg');
  });

  it('rejects when qiniu returns non-200', async () => {
    mock.queueUploadFile({ statusCode: 401, data: '{"error":"bad token"}' });
    await expect(uploadsService.uploadToQiniu({
      token: 't', key: 'k', uploadUrl: 'https://up', filePath: 'wxfile://x',
    })).rejects.toThrow(/401/);
  });

  it('rejects when qiniu returns malformed JSON', async () => {
    mock.queueUploadFile({ statusCode: 200, data: 'not json' });
    await expect(uploadsService.uploadToQiniu({
      token: 't', key: 'k', uploadUrl: 'https://up', filePath: 'wxfile://x',
    })).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/services/uploads.ts`**

```typescript
import { apiClient } from './_client.js';
import { ensureOk } from './_http.js';
import { resolveApiBase } from '../config.js';

export interface UploadTokenBundle {
  token: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface QiniuReturnBody {
  key: string;
  hash: string;
  size: number;
  width: number;
  height: number;
}

interface RequestTokensOpts {
  ext: string;
  count: number;
  collectionDraftId?: string;
}

interface UploadToQiniuOpts {
  token: string;
  key: string;
  uploadUrl: string;
  filePath: string;
}

export const uploadsService = {
  async requestTokens(opts: RequestTokensOpts): Promise<UploadTokenBundle[]> {
    const url = `${resolveApiBase()}/api/uploads/token`;
    const body: Record<string, unknown> = { ext: opts.ext, count: opts.count };
    if (opts.collectionDraftId) body.collectionDraftId = opts.collectionDraftId;
    const res = await apiClient.request<{ tokens: UploadTokenBundle[] }>({
      url,
      method: 'POST',
      data: body,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data.tokens;
  },

  uploadToQiniu(opts: UploadToQiniuOpts): Promise<QiniuReturnBody> {
    return new Promise((resolveOk, reject) => {
      wx.uploadFile({
        url: opts.uploadUrl,
        filePath: opts.filePath,
        name: 'file',
        formData: { token: opts.token, key: opts.key },
        success: (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Qiniu upload ${res.statusCode}`));
            return;
          }
          try {
            const parsed = JSON.parse(res.data) as QiniuReturnBody;
            if (!parsed.key) throw new Error('missing key in qiniu response');
            resolveOk(parsed);
          } catch (e) {
            reject(e);
          }
        },
        fail: reject,
      });
    });
  },
};
```

- [ ] **Step 4: Run — must pass**

Expected: 86 + 5 = **91**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/services/uploads.ts apps/miniapp/tests/lib/services/uploads.test.ts apps/miniapp/tests/helpers/wxMock.ts
git commit -m "feat(miniapp): uploadsService — token request + direct-to-Qiniu uploadFile"
```

---

## Task 5: Extend `collectionsService` with `create` / `append` / `byTitle`

**Files:** Modify `apps/miniapp/miniprogram/lib/services/collections.ts` + Create `apps/miniapp/tests/lib/services/collections.write.test.ts`.

Reuse the existing shared `CollectionCreateInput` / `CollectionAppendInput` types. The `byTitle` response shape isn't in `@daynest/shared` so we declare it locally.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { collectionsService } from '../../../miniprogram/lib/services/collections.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('collectionsService.create', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('POSTs to /api/collections with the full body', async () => {
    mock.queueResponse({ statusCode: 201, data: { id: 'c1', title: 'Trip', photos: [], previewPhotos: [], tags: [], photoCount: 0 } });
    const res = await collectionsService.create({
      title: 'Trip',
      description: null,
      occurredOn: '2026-05-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [{ fileKey: 'k1', width: 1600, height: 1200, caption: null, takenAt: null, tags: [] }],
    });
    expect(res.id).toBe('c1');
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/collections$/);
    expect((req?.data as { title: string }).title).toBe('Trip');
  });
});

describe('collectionsService.append', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('POSTs to /api/collections/<id>/append', async () => {
    mock.queueResponse({ statusCode: 200, data: { id: 'c-existing', title: 'X', photos: [] } });
    await collectionsService.append('c-existing', {
      photos: [{ fileKey: 'k2', width: 800, height: 600, caption: null, takenAt: null, tags: [] }],
      extraTags: ['新增'],
    });
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/collections\/c-existing\/append$/);
    expect((req?.data as { extraTags: string[] }).extraTags).toEqual(['新增']);
  });
});

describe('collectionsService.byTitle', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('GETs /api/collections/by-title with the title query', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { collection: null, directTags: [], matches: [] },
    });
    const res = await collectionsService.byTitle('summer');
    expect(res.collection).toBeNull();
    expect(res.matches).toEqual([]);
    expect(mock.requests[0]?.url).toMatch(/\/api\/collections\/by-title\?title=summer$/);
  });

  it('URL-encodes CJK titles', async () => {
    mock.queueResponse({ statusCode: 200, data: { collection: null, directTags: [], matches: [] } });
    await collectionsService.byTitle('夏日');
    expect(mock.requests[0]?.url).toMatch(/\/api\/collections\/by-title\?title=%E5%A4%8F%E6%97%A5$/);
  });
});
```

- [ ] **Step 2: Run — must fail**

- [ ] **Step 3: Extend `collections.ts`**

Append to `apps/miniapp/miniprogram/lib/services/collections.ts`:

```typescript
import type {
  CollectionDetailDTO,
  CollectionSummaryDTO,
  CollectionCreateInput,
  CollectionAppendInput,
} from '@daynest/shared';

export interface ByTitleMatch {
  collection: CollectionDetailDTO;
  directTags: string[];
  score: number;
  matchType: 'exact' | 'contains' | 'subsequence';
}

export interface ByTitleResponse {
  collection: CollectionDetailDTO | null;
  directTags: string[];
  matches: ByTitleMatch[];
}

// Add inside the `collectionsService = { ... }` object literal:

  async create(body: CollectionCreateInput): Promise<CollectionDetailDTO> {
    const url = `${resolveApiBase()}/api/collections`;
    const res = await apiClient.request<CollectionDetailDTO>({
      url,
      method: 'POST',
      data: body,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data;
  },

  async append(id: string, body: CollectionAppendInput): Promise<CollectionDetailDTO> {
    const url = `${resolveApiBase()}/api/collections/${encodeURIComponent(id)}/append`;
    const res = await apiClient.request<CollectionDetailDTO>({
      url,
      method: 'POST',
      data: body,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data;
  },

  async byTitle(title: string): Promise<ByTitleResponse> {
    const url = `${resolveApiBase()}/api/collections/by-title?title=${encodeURIComponent(title)}`;
    const res = await apiClient.request<ByTitleResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },
```

(Keep the existing `list` / `get` methods intact.)

The shared `CollectionCreateInput` includes optional `description` / `occurredUntil` / `location` (`.nullable().default(null)`) and required `title` / `occurredOn` / `photos`. The miniapp UI always provides nulls explicitly for the optional fields rather than relying on Zod defaults (the wire goes through `wx.request`, not through Zod parsing on the client side).

- [ ] **Step 4: Run — must pass**

Expected: 91 + 4 = **95**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/services/collections.ts apps/miniapp/tests/lib/services/collections.write.test.ts
git commit -m "feat(miniapp): collectionsService.create/append/byTitle for upload flow"
```

---

## Task 6: `stores/uploadStore.ts` — per-photo state + overall progress

**Files:** Create `apps/miniapp/miniprogram/stores/uploadStore.ts` + `apps/miniapp/tests/stores/uploadStore.test.ts`.

The store holds the user's current upload draft (one at a time) and exposes mutators. Each photo in the draft moves through a state machine: `queued` → `compressing` → `uploading` → `done` (or `failed` at any step). The store does NOT execute the pipeline itself — that's the page's job. It just tracks state.

### Public shape

```typescript
export type PhotoStage =
  | { kind: 'queued' }
  | { kind: 'compressing' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'done'; fileKey: string; width: number; height: number; takenAt: string | null }
  | { kind: 'failed'; error: string };

export interface DraftPhoto {
  id: string;             // local id, e.g. nanoid
  originalPath: string;   // wx.chooseMedia result
  thumbPath: string;      // for the picker preview (the original is fine)
  width: number;          // original dimensions
  height: number;
  size: number;           // bytes
  stage: PhotoStage;
}

export interface UploadStoreState {
  photos: DraftPhoto[];
  title: string;
  description: string;
  location: string;
  tags: string[];
  occurredOn: string;     // YYYY-MM-DD
  draftId: string;        // uuid, used as Qiniu folder
}

// Standard createStore<UploadStoreState> from lib/store.ts + a few mutator helpers.
```

The implementation uses `lib/store.ts`'s `createStore` — same pattern as `authStore` and `themeStore`. Add helpers as standalone functions that take a store reference (mirror the `authStore.ts` pattern).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { uploadStore } from '../../miniprogram/stores/uploadStore.js';

describe('uploadStore', () => {
  beforeEach(() => uploadStore.reset());

  it('starts empty with today\'s date', () => {
    const s = uploadStore.get();
    expect(s.photos).toEqual([]);
    expect(s.title).toBe('');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(s.occurredOn)).toBe(true);
  });

  it('addPhotos appends new entries with stage=queued', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a.jpg', thumbPath: 'a.jpg', width: 100, height: 100, size: 1000 },
    ]);
    expect(uploadStore.get().photos.length).toBe(1);
    expect(uploadStore.get().photos[0]?.stage).toEqual({ kind: 'queued' });
  });

  it('removePhoto drops the matching entry by id', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a.jpg', thumbPath: 'a.jpg', width: 1, height: 1, size: 1 },
      { id: 'p2', originalPath: 'b.jpg', thumbPath: 'b.jpg', width: 1, height: 1, size: 1 },
    ]);
    uploadStore.removePhoto('p1');
    expect(uploadStore.get().photos.map((p) => p.id)).toEqual(['p2']);
  });

  it('setStage updates the stage on the matching photo immutably', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a.jpg', thumbPath: 'a.jpg', width: 1, height: 1, size: 1 },
    ]);
    const before = uploadStore.get().photos[0];
    uploadStore.setStage('p1', { kind: 'uploading', percent: 40 });
    const after = uploadStore.get().photos[0];
    expect(after?.stage).toEqual({ kind: 'uploading', percent: 40 });
    // Immutability: array element should be a new object
    expect(after).not.toBe(before);
  });

  it('setMeta merges metadata fields', () => {
    uploadStore.setMeta({ title: 'Hello', location: 'Earth' });
    expect(uploadStore.get().title).toBe('Hello');
    expect(uploadStore.get().location).toBe('Earth');
  });

  it('overallProgress returns the fraction of photos done', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a', thumbPath: 'a', width: 1, height: 1, size: 1 },
      { id: 'p2', originalPath: 'b', thumbPath: 'b', width: 1, height: 1, size: 1 },
    ]);
    uploadStore.setStage('p1', { kind: 'done', fileKey: 'k1', width: 1, height: 1, takenAt: null });
    expect(uploadStore.overallProgress()).toBe(0.5);
  });

  it('reset clears state and generates a fresh draftId', () => {
    const a = uploadStore.get().draftId;
    uploadStore.addPhotos([{ id: 'p', originalPath: 'a', thumbPath: 'a', width: 1, height: 1, size: 1 }]);
    uploadStore.reset();
    expect(uploadStore.get().photos).toEqual([]);
    expect(uploadStore.get().draftId).not.toBe(a);
  });
});
```

- [ ] **Step 2: Create `apps/miniapp/miniprogram/stores/uploadStore.ts`**

```typescript
import { createStore } from '../lib/store.js';

export type PhotoStage =
  | { kind: 'queued' }
  | { kind: 'compressing' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'done'; fileKey: string; width: number; height: number; takenAt: string | null }
  | { kind: 'failed'; error: string };

export interface DraftPhoto {
  id: string;
  originalPath: string;
  thumbPath: string;
  width: number;
  height: number;
  size: number;
  stage: PhotoStage;
}

export interface UploadStoreState {
  photos: DraftPhoto[];
  title: string;
  description: string;
  location: string;
  tags: string[];
  occurredOn: string;
  draftId: string;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newDraftId(): string {
  // RFC4122-ish; enough for grouping uploads in Qiniu storage.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function initialState(): UploadStoreState {
  return {
    photos: [],
    title: '',
    description: '',
    location: '',
    tags: [],
    occurredOn: todayLocal(),
    draftId: newDraftId(),
  };
}

const store = createStore<UploadStoreState>(initialState());

export const uploadStore = {
  get: () => store.getState(),
  subscribe: store.subscribe.bind(store),

  reset() {
    store.setState(initialState());
  },

  addPhotos(items: Omit<DraftPhoto, 'stage'>[]) {
    const next: DraftPhoto[] = items.map((it) => ({ ...it, stage: { kind: 'queued' as const } }));
    const s = store.getState();
    store.setState({ ...s, photos: [...s.photos, ...next] });
  },

  removePhoto(id: string) {
    const s = store.getState();
    store.setState({ ...s, photos: s.photos.filter((p) => p.id !== id) });
  },

  setStage(id: string, stage: PhotoStage) {
    const s = store.getState();
    store.setState({
      ...s,
      photos: s.photos.map((p) => (p.id === id ? { ...p, stage } : p)),
    });
  },

  setMeta(patch: Partial<Pick<UploadStoreState, 'title' | 'description' | 'location' | 'tags' | 'occurredOn'>>) {
    const s = store.getState();
    store.setState({ ...s, ...patch });
  },

  overallProgress(): number {
    const s = store.getState();
    if (s.photos.length === 0) return 0;
    const done = s.photos.filter((p) => p.stage.kind === 'done').length;
    return done / s.photos.length;
  },
};
```

- [ ] **Step 3: Run — must pass**

Expected: 95 + 7 = **102**.

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/stores/uploadStore.ts apps/miniapp/tests/stores/uploadStore.test.ts
git commit -m "feat(miniapp): uploadStore — per-photo stage machine + draft metadata"
```

---

## Task 7: `components/tag-picker/index` — autocomplete tag input

**Files:** Create `apps/miniapp/miniprogram/components/tag-picker/index.{ts,wxml,wxss,json}` + `apps/miniapp/tests/components/tag-picker.test.ts`.

Behavior:
- Displays an array of selected tag chips (deletable on tap-X)
- An input below for typing a new tag
- A suggestion strip showing matching existing tags (from `tagsService.list()` if `suggest` prop populated)
- Pressing 完成 (`bindconfirm`) or tapping a suggestion adds the tag
- Emits `change` with the new tag array

### Public properties

```typescript
properties: {
  value: { type: Array, value: [] as string[] },     // current tags
  suggest: { type: Array, value: [] as string[] },   // candidate display names for autocomplete
  placeholder: { type: String, value: '加个标签…' },
}
```

### Public events

- `change` — `detail.value: string[]`

The component is "controlled" — parent owns the `value` array and reacts to `change`.

- [ ] **Step 1: Create `index.json`**

```json
{ "component": true, "usingComponents": {} }
```

- [ ] **Step 2: Create `index.wxml`**

```html
<view class="picker">
  <view class="chips">
    <view wx:for="{{value}}" wx:key="*this" class="chip">
      #{{item}}
      <view class="chip__x" data-tag="{{item}}" bindtap="onRemove">×</view>
    </view>
    <input
      class="chip__input"
      placeholder="{{placeholder}}"
      value="{{draft}}"
      bindinput="onInput"
      bindconfirm="onConfirm"
      confirm-type="done"
      maxlength="40"
    />
  </view>
  <view wx:if="{{visibleSuggestions.length > 0}}" class="suggest">
    <view
      wx:for="{{visibleSuggestions}}"
      wx:key="*this"
      class="suggest__chip"
      data-tag="{{item}}"
      bindtap="onPickSuggest"
    >#{{item}}</view>
  </view>
</view>
```

- [ ] **Step 3: Create `index.wxss`**

```css
.picker { display: flex; flex-direction: column; gap: 12rpx; }
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  padding: 12rpx;
  background: var(--paper-cream);
  border: 1px solid var(--paper-aged);
  border-radius: 8rpx;
  min-height: 80rpx;
  align-items: center;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 16rpx;
  background: var(--ink-primary);
  color: var(--paper-cream);
  border-radius: 999rpx;
  font-size: 24rpx;
}
.chip__x {
  font-size: 28rpx;
  line-height: 1;
  padding: 0 4rpx;
  opacity: .8;
}
.chip__input {
  flex: 1;
  min-width: 240rpx;
  font-size: 26rpx;
  color: var(--ink-primary);
  padding: 6rpx 8rpx;
}
.suggest { display: flex; flex-wrap: wrap; gap: 10rpx; padding: 0 4rpx; }
.suggest__chip {
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  background: var(--paper-aged);
  color: var(--ink-primary);
  border-radius: 999rpx;
}
```

- [ ] **Step 4: Create `index.ts`**

```typescript
Component({
  properties: {
    value: { type: Array, value: [] as string[] },
    suggest: { type: Array, value: [] as string[] },
    placeholder: { type: String, value: '加个标签…' },
  },
  data: {
    draft: '',
    visibleSuggestions: [] as string[],
  },
  observers: {
    'value, suggest, draft'(value: string[], suggest: string[], draft: string) {
      const have = new Set(value);
      const filt = (suggest ?? [])
        .filter((s) => !have.has(s))
        .filter((s) => (draft.trim() ? s.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase()) : true))
        .slice(0, 8);
      this.setData({ visibleSuggestions: filt });
    },
  },
  methods: {
    onInput(e: WechatMiniprogram.Input) {
      this.setData({ draft: e.detail.value });
    },
    onConfirm() {
      const t = this.data.draft.trim();
      if (!t) return;
      this.addTag(t);
    },
    onPickSuggest(e: WechatMiniprogram.TouchEvent) {
      const t = (e.currentTarget.dataset.tag as string).trim();
      if (!t) return;
      this.addTag(t);
    },
    onRemove(e: WechatMiniprogram.TouchEvent) {
      const t = e.currentTarget.dataset.tag as string;
      const next = (this.properties.value as string[]).filter((x) => x !== t);
      this.triggerEvent('change', { value: next });
    },
    addTag(t: string) {
      const cur = this.properties.value as string[];
      if (cur.includes(t)) {
        this.setData({ draft: '' });
        return;
      }
      this.triggerEvent('change', { value: [...cur, t] });
      this.setData({ draft: '' });
    },
  },
});
```

- [ ] **Step 5: Write the test**

`apps/miniapp/tests/components/tag-picker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// The component runs inside the WeChat runtime; vitest can't invoke Component()
// directly. We test the pure utility (filter+dedupe) by importing the same
// logic shape used inside the observer. Keep the test minimal — the bulk of
// the component's behavior is covered by manual DevTools verification.

describe('tag-picker filter logic', () => {
  function filterSuggestions(value: string[], suggest: string[], draft: string): string[] {
    const have = new Set(value);
    const q = draft.trim().toLocaleLowerCase();
    return (suggest ?? [])
      .filter((s) => !have.has(s))
      .filter((s) => (q ? s.toLocaleLowerCase().includes(q) : true))
      .slice(0, 8);
  }

  it('hides already-selected tags from suggestions', () => {
    expect(filterSuggestions(['Travel'], ['Travel', 'Food', 'Family'], '')).toEqual(['Food', 'Family']);
  });

  it('filters by draft substring case-insensitively', () => {
    expect(filterSuggestions([], ['Travel', 'Food', 'Family'], 'fa')).toEqual(['Family']);
  });

  it('caps at 8 results', () => {
    const ten = Array.from({ length: 10 }, (_, i) => 't' + i);
    expect(filterSuggestions([], ten, '').length).toBe(8);
  });
});
```

The "real" tag-picker component is exercised via the page in manual verification. The pure utility test catches the filter logic bug class that would surface in DevTools.

- [ ] **Step 6: Run — must pass**

Expected: 102 + 3 = **105**.

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp/miniprogram/components/tag-picker apps/miniapp/tests/components/tag-picker.test.ts
git commit -m "feat(miniapp): tag-picker component (chip + autocomplete + dedupe)"
```

---

## Task 8: `pkgUpload` subpackage + app.json

**Files:** Modify `apps/miniapp/miniprogram/app.json`.

- [ ] **Step 1: Extend `subPackages`**

Add to the `subPackages` array:

```json
{
  "root": "pkgUpload/",
  "name": "pkgUpload",
  "pages": ["new/index"]
}
```

- [ ] **Step 2: Extend `preloadRule`**

Add an entry:

```json
"pages/timeline/index": {
  "network": "wifi",
  "packages": ["pkgCollection", "pkgUpload"]
}
```

(Merge with the existing `pages/timeline/index` entry — it already lists `pkgCollection`.)

- [ ] **Step 3: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/app.json
git commit -m "chore(miniapp): register pkgUpload subpackage + extend timeline preload"
```

---

## Task 9: `pkgUpload/new/index` — composition page

**Files:** Create `apps/miniapp/miniprogram/pkgUpload/new/index.{ts,wxml,wxss,json}`.

This is the heart of Plan 05 — picker, metadata form, fuzzy-title autocomplete, tag picker, progress bar, submit. ~250 LOC of TS.

### Flow

1. `onLoad`: `uploadStore.reset()` (start fresh). Kick off `tagsService.list()` to populate suggestions in the background.
2. **Picker:** tap "选照片" → `wx.chooseMedia({ count: 9, sizeType: ['original'], mediaType: ['image'] })`. For each result, push into `uploadStore.addPhotos` with the original path. Run EXIF read in the background — first photo's `DateTimeOriginal` populates `occurredOn` (if not user-overridden) and that photo's draft `takenAt`.
3. **Metadata form:** title (debounced fuzzy lookup), description, location, occurredOn (datepicker), tags (tag-picker component).
4. **Fuzzy match:** when `byTitle` returns an exact match, show a "和「XX」合并？" toggle. When toggled on, store the matched collection id and switch the submit path to `append`.
5. **Submit:** disabled until `photos.length > 0 && title.length > 0`. On tap:
   - Set each queued photo's stage to `compressing` then run `compressImage` serially per photo (parallel here would thrash mobile decoders).
   - Once compressed, request `uploadsService.requestTokens({ ext: 'jpg', count, collectionDraftId: draftId })`.
   - Schedule `uploadToQiniu` per (photo, token) pair on a 10-concurrent `uploadQueue`. On per-photo success, set stage to `done` with `fileKey` + Qiniu-returned width/height.
   - When all done, build the `CollectionCreateInput` (or `CollectionAppendInput` if `mergeIntoId` is set) and call the appropriate service.
   - On success, `wx.showToast` + `wx.navigateBack`. On failure, show the failed photos and a retry button.

### Step 1: Create `index.json`

```json
{
  "navigationBarTitleText": "新建集合",
  "usingComponents": {
    "tag-picker": "/components/tag-picker/index"
  }
}
```

### Step 2: Create `index.wxml`

```html
<view class="page">
  <view class="section">
    <view class="section__head">照片 ({{photos.length}})</view>
    <view class="grid">
      <view wx:for="{{photos}}" wx:key="id" class="cell">
        <image class="cell__img" src="{{item.thumbPath}}" mode="aspectFill" />
        <view wx:if="{{item.stage.kind === 'compressing'}}" class="cell__overlay">压缩中…</view>
        <view wx:elif="{{item.stage.kind === 'uploading'}}" class="cell__overlay">上传 {{item.stage.percent}}%</view>
        <view wx:elif="{{item.stage.kind === 'failed'}}" class="cell__overlay cell__overlay--err">失败</view>
        <view wx:elif="{{item.stage.kind === 'done'}}" class="cell__overlay cell__overlay--ok">✓</view>
        <view wx:if="{{!uploading}}" class="cell__del" data-id="{{item.id}}" bindtap="onRemovePhoto">×</view>
      </view>
      <view wx:if="{{!uploading && photos.length < 50}}" class="cell cell--add" bindtap="onPickMore">+</view>
    </view>
  </view>

  <view class="section">
    <view class="section__head">标题</view>
    <input class="input" placeholder="给这次回忆起个名字" value="{{title}}" bindinput="onTitleInput" maxlength="200" />
    <view wx:if="{{mergeCandidateTitle}}" class="merge">
      已存在「{{mergeCandidateTitle}}」
      <switch class="merge__switch" checked="{{mergeIntoId !== ''}}" bindchange="onMergeToggle" />
      合并
    </view>
  </view>

  <view class="section">
    <view class="section__head">日期</view>
    <picker mode="date" value="{{occurredOn}}" bindchange="onDateChange">
      <view class="input input--picker">{{occurredOn}}</view>
    </picker>
  </view>

  <view class="section">
    <view class="section__head">地点（可选）</view>
    <input class="input" placeholder="家、公园、远方…" value="{{location}}" bindinput="onLocationInput" maxlength="200" />
  </view>

  <view class="section">
    <view class="section__head">描述（可选）</view>
    <textarea class="textarea" placeholder="这一刻你想说的话…" value="{{description}}" bindinput="onDescriptionInput" maxlength="10000" auto-height="true" />
  </view>

  <view class="section">
    <view class="section__head">标签</view>
    <tag-picker value="{{tags}}" suggest="{{tagSuggestions}}" bind:change="onTagsChange" />
  </view>

  <view wx:if="{{uploading}}" class="progress">
    <view class="progress__bar"><view class="progress__fill" style="width: {{progressPercent}}%"></view></view>
    <view class="progress__text">{{progressLabel}}</view>
  </view>

  <view class="footer">
    <button class="submit {{canSubmit ? '' : 'submit--disabled'}}" disabled="{{!canSubmit}}" bindtap="onSubmit">
      {{uploading ? '上传中…' : (mergeIntoId ? '加入「' + mergeCandidateTitle + '」' : '创建集合')}}
    </button>
  </view>
</view>
```

### Step 3: Create `index.wxss`

```css
.page { background: var(--paper-cream); min-height: 100vh; padding: 24rpx 24rpx 200rpx; }
.section { margin-bottom: 28rpx; background: #FFFCF5; border-radius: 12rpx; padding: 20rpx; box-shadow: var(--shadow-polaroid); }
.section__head { font-size: 26rpx; color: var(--ink-secondary); margin-bottom: 16rpx; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12rpx; }
.cell { position: relative; aspect-ratio: 1 / 1; background: var(--paper-aged); border-radius: 8rpx; overflow: hidden; }
.cell__img { width: 100%; height: 100%; }
.cell__overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.5); color: #FFFCF5; font-size: 22rpx;
}
.cell__overlay--err { background: rgba(120, 50, 40, .65); }
.cell__overlay--ok  { background: rgba(60, 110, 60, .55); }
.cell__del {
  position: absolute; top: 4rpx; right: 4rpx;
  width: 36rpx; height: 36rpx; border-radius: 50%;
  background: rgba(0,0,0,.6); color: #FFFCF5;
  font-size: 32rpx; line-height: 36rpx; text-align: center;
}
.cell--add {
  display: flex; align-items: center; justify-content: center;
  font-size: 60rpx; color: var(--ink-secondary);
  border: 2rpx dashed var(--ink-secondary);
  background: transparent;
}
.input {
  background: var(--paper-cream); border: 1px solid var(--paper-aged);
  border-radius: 8rpx; padding: 16rpx; font-size: 28rpx; color: var(--ink-primary);
}
.input--picker { display: flex; align-items: center; }
.textarea { width: 100%; min-height: 120rpx; background: var(--paper-cream); border: 1px solid var(--paper-aged); border-radius: 8rpx; padding: 16rpx; font-size: 28rpx; color: var(--ink-primary); box-sizing: border-box; }
.merge { display: flex; align-items: center; gap: 12rpx; margin-top: 12rpx; font-size: 24rpx; color: var(--ink-secondary); }
.merge__switch { transform: scale(.7); }
.progress {
  position: fixed; left: 24rpx; right: 24rpx; bottom: 160rpx;
  background: #FFFCF5; padding: 16rpx; border-radius: 12rpx;
  box-shadow: var(--shadow-polaroid);
}
.progress__bar { height: 8rpx; background: var(--paper-aged); border-radius: 999rpx; overflow: hidden; }
.progress__fill { height: 100%; background: var(--ink-primary); transition: width 200ms ease; }
.progress__text { font-size: 22rpx; color: var(--ink-secondary); margin-top: 8rpx; text-align: right; }
.footer {
  position: fixed; left: 0; right: 0; bottom: 0;
  padding: 16rpx 24rpx 32rpx; background: var(--paper-cream); border-top: 1rpx solid var(--paper-aged);
}
.submit {
  background: var(--ink-primary); color: var(--paper-cream);
  border-radius: 999rpx; padding: 22rpx 0; font-size: 30rpx;
}
.submit--disabled { background: var(--paper-aged); color: var(--ink-secondary); }
```

### Step 4: Create `index.ts`

This is the longest file in Plan 05; commit it as one piece. The implementation reuses every utility from Tasks 1–7.

```typescript
import type { CollectionCreateInput, CollectionAppendInput, TagDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { tagsService } from '../../lib/services/tags.js';
import { uploadsService } from '../../lib/services/uploads.js';
import { uploadStore, type DraftPhoto } from '../../stores/uploadStore.js';
import { compressImage } from '../../lib/imageCompress.js';
import { readExifFromPath } from '../../lib/exif.js';
import { createUploadQueue } from '../../lib/uploadQueue.js';
import { debounce, type DebouncedFn } from '../../lib/debounce.js';

let unsubscribe: (() => void) | null = null;
let titleSearch: DebouncedFn<[string]> | null = null;

const QUEUE_CONCURRENCY = 10;
const COMPRESS_LONG_EDGE = 1600;

interface PageData {
  photos: DraftPhoto[];
  title: string;
  description: string;
  location: string;
  tags: string[];
  occurredOn: string;
  tagSuggestions: string[];
  mergeCandidateId: string;
  mergeCandidateTitle: string;
  mergeIntoId: string;
  uploading: boolean;
  canSubmit: boolean;
  progressPercent: number;
  progressLabel: string;
}

Page({
  data: {
    photos: [],
    title: '',
    description: '',
    location: '',
    tags: [],
    occurredOn: '',
    tagSuggestions: [],
    mergeCandidateId: '',
    mergeCandidateTitle: '',
    mergeIntoId: '',
    uploading: false,
    canSubmit: false,
    progressPercent: 0,
    progressLabel: '',
  } as PageData,

  onLoad() {
    uploadStore.reset();
    this.syncFromStore();
    unsubscribe = uploadStore.subscribe(() => this.syncFromStore());
    titleSearch = debounce<[string]>(this.lookupTitle.bind(this), 400);
    void this.loadTagSuggestions();
  },

  onUnload() {
    unsubscribe?.();
    unsubscribe = null;
    titleSearch?.cancel();
    titleSearch = null;
  },

  syncFromStore() {
    const s = uploadStore.get();
    const canSubmit = s.photos.length > 0 && s.title.trim().length > 0 && !this.data.uploading;
    const done = s.photos.filter((p) => p.stage.kind === 'done').length;
    const total = s.photos.length;
    this.setData({
      photos: s.photos,
      title: s.title,
      description: s.description,
      location: s.location,
      tags: s.tags,
      occurredOn: s.occurredOn,
      canSubmit,
      progressPercent: total > 0 ? Math.round((done / total) * 100) : 0,
      progressLabel: total > 0 ? `${done} / ${total}` : '',
    });
  },

  async loadTagSuggestions() {
    try {
      const tags = await tagsService.list();
      this.setData({ tagSuggestions: tags.map((t: TagDTO) => t.displayName) });
    } catch {
      // Suggestions are a polish — silently fall back to none.
    }
  },

  async onPickMore() {
    if (this.data.uploading) return;
    const remaining = Math.max(0, 50 - this.data.photos.length);
    if (remaining === 0) {
      wx.showToast({ title: '最多 50 张', icon: 'none' });
      return;
    }
    try {
      const res = await new Promise<{ tempFiles: Array<{ tempFilePath: string; size: number; width?: number; height?: number }> }>((resolveOk, reject) => {
        wx.chooseMedia({
          count: Math.min(9, remaining),
          mediaType: ['image'],
          sizeType: ['original'],
          sourceType: ['album', 'camera'],
          success: resolveOk,
          fail: reject,
        });
      });
      const items = res.tempFiles.map((f) => ({
        id: 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        originalPath: f.tempFilePath,
        thumbPath: f.tempFilePath,
        width: f.width ?? 0,
        height: f.height ?? 0,
        size: f.size,
      }));
      uploadStore.addPhotos(items);
      // Background EXIF for default-date heuristic on the FIRST photo only.
      if (this.data.photos.length === 0 && items[0]) {
        void this.tryDefaultDateFrom(items[0].originalPath);
      }
    } catch {
      // User cancelled — no toast.
    }
  },

  async tryDefaultDateFrom(path: string) {
    try {
      const exif = await readExifFromPath(path);
      if (exif.dateTimeOriginal) {
        const ymd = exif.dateTimeOriginal.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          uploadStore.setMeta({ occurredOn: ymd });
        }
      }
    } catch {
      // best-effort
    }
  },

  onRemovePhoto(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading) return;
    const id = e.currentTarget.dataset.id as string;
    uploadStore.removePhoto(id);
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value;
    uploadStore.setMeta({ title: v });
    titleSearch?.run(v);
  },

  async lookupTitle(title: string) {
    const t = title.trim();
    if (!t) {
      this.setData({ mergeCandidateId: '', mergeCandidateTitle: '', mergeIntoId: '' });
      return;
    }
    try {
      const res = await collectionsService.byTitle(t);
      if (res.collection) {
        this.setData({
          mergeCandidateId: res.collection.id,
          mergeCandidateTitle: res.collection.title,
        });
      } else {
        this.setData({ mergeCandidateId: '', mergeCandidateTitle: '', mergeIntoId: '' });
      }
    } catch {
      // Best-effort.
    }
  },

  onMergeToggle(e: WechatMiniprogram.SwitchChange) {
    this.setData({ mergeIntoId: e.detail.value ? this.data.mergeCandidateId : '' });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    uploadStore.setMeta({ occurredOn: e.detail.value as string });
  },

  onLocationInput(e: WechatMiniprogram.Input) {
    uploadStore.setMeta({ location: e.detail.value });
  },

  onDescriptionInput(e: WechatMiniprogram.Input) {
    uploadStore.setMeta({ description: e.detail.value });
  },

  onTagsChange(e: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    uploadStore.setMeta({ tags: e.detail.value });
  },

  async onSubmit() {
    const s = uploadStore.get();
    if (s.photos.length === 0 || s.title.trim().length === 0 || this.data.uploading) return;
    this.setData({ uploading: true });
    try {
      // 1) Compress each photo serially (parallel decoders thrash mobile)
      for (const p of s.photos) {
        if (p.stage.kind === 'done') continue;
        uploadStore.setStage(p.id, { kind: 'compressing' });
        try {
          const c = await compressImage({ src: p.originalPath, longEdge: COMPRESS_LONG_EDGE });
          // Replace path/dimensions in-place by re-adding with the compressed temp file.
          // We track new dims on the photo via setStage with a temporary uploading-0% marker;
          // the final fileKey/width/height come from Qiniu's returnBody.
          uploadStore.setStage(p.id, { kind: 'uploading', percent: 0 });
          // store compressed path on a side map
          compressedPaths.set(p.id, { path: c.tempFilePath, w: c.width, h: c.height });
        } catch (err) {
          uploadStore.setStage(p.id, { kind: 'failed', error: String(err) });
        }
      }
      // 2) Request a batch of tokens
      const toUpload = uploadStore.get().photos.filter((p) => p.stage.kind === 'uploading');
      if (toUpload.length === 0) throw new Error('no photos to upload');
      const tokens = await uploadsService.requestTokens({
        ext: 'jpg',
        count: toUpload.length,
        collectionDraftId: s.draftId,
      });
      if (tokens.length < toUpload.length) throw new Error('token shortfall');
      // 3) Pair and run uploads through the bounded queue
      const queue = createUploadQueue({ concurrency: QUEUE_CONCURRENCY });
      const exifByPhoto = new Map<string, string | null>();
      // EXIF pre-read for takenAt (best-effort, in parallel with uploads)
      const photoExifPromises = toUpload.map(async (p) => {
        const ex = await readExifFromPath(p.originalPath);
        exifByPhoto.set(p.id, ex.dateTimeOriginal ?? null);
      });
      const uploads = toUpload.map((p, idx) => queue.enqueue(async () => {
        const token = tokens[idx]!;
        const compressed = compressedPaths.get(p.id);
        if (!compressed) throw new Error('compressed path missing for ' + p.id);
        try {
          const ret = await uploadsService.uploadToQiniu({
            token: token.token,
            key: token.key,
            uploadUrl: token.uploadUrl,
            filePath: compressed.path,
          });
          await Promise.race([
            Promise.resolve(exifByPhoto.get(p.id)),
            new Promise<null>((r) => setTimeout(() => r(null), 50)),
          ]);
          uploadStore.setStage(p.id, {
            kind: 'done',
            fileKey: ret.key,
            width: ret.width || compressed.w,
            height: ret.height || compressed.h,
            takenAt: exifByPhoto.get(p.id) ?? null,
          });
        } catch (err) {
          uploadStore.setStage(p.id, { kind: 'failed', error: String(err) });
          throw err;
        }
      }));
      await Promise.allSettled([Promise.all(photoExifPromises), ...uploads]);
      // 4) Commit
      const finalState = uploadStore.get();
      const succeeded = finalState.photos.filter((p) => p.stage.kind === 'done');
      if (succeeded.length === 0) throw new Error('all uploads failed');
      const photoInputs = succeeded.map((p) => {
        const done = p.stage as Extract<typeof p.stage, { kind: 'done' }>;
        return {
          fileKey: done.fileKey,
          width: done.width,
          height: done.height,
          caption: null,
          takenAt: done.takenAt,
          tags: [],
        };
      });
      if (this.data.mergeIntoId) {
        const body: CollectionAppendInput = { photos: photoInputs, extraTags: finalState.tags };
        await collectionsService.append(this.data.mergeIntoId, body);
        wx.showToast({ title: '已加入', icon: 'success' });
      } else {
        const body: CollectionCreateInput = {
          title: finalState.title.trim(),
          description: finalState.description.trim() || null,
          occurredOn: finalState.occurredOn,
          occurredUntil: null,
          location: finalState.location.trim() || null,
          tags: finalState.tags,
          photos: photoInputs,
        };
        await collectionsService.create(body);
        wx.showToast({ title: '创建成功', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 700);
    } catch (err) {
      wx.showToast({ title: '上传失败', icon: 'none' });
      this.setData({ uploading: false });
      console.error('upload submit', err);
    }
  },
});

// Module-scoped: maps photo id → compressed temp path + dimensions. Kept
// outside Page() data because compressed paths are runtime-only and don't
// need to round-trip through setData (they're not bound in WXML).
const compressedPaths = new Map<string, { path: string; w: number; h: number }>();
```

- [ ] **Step 5: Verify tsc**

```bash
pnpm --filter @daynest/miniapp build
```

- [ ] **Step 6: Verify miniapp tests still pass at **105** (no new tests in this task — page covered by manual + smoke).

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp/miniprogram/pkgUpload
git commit -m "feat(miniapp): pkgUpload/new — picker, metadata, fuzzy merge, parallel upload"
```

---

## Task 10: Timeline `+` FAB → upload page

**Files:** Modify `apps/miniapp/miniprogram/pages/timeline/index.{wxml,wxss,ts}`.

A circular floating action button in the bottom-right of the timeline. Hidden when scrolling? — no, keep it simple, always visible.

- [ ] **Step 1: Extend `index.wxml`**

Inside `<view class="page">`, after the closing `</scroll-view>`, add:

```html
<view class="fab" bindtap="onFabTap">
  <text class="fab__plus">+</text>
</view>
```

- [ ] **Step 2: Extend `index.wxss`**

Append:

```css
.fab {
  position: fixed;
  right: 40rpx;
  bottom: 160rpx;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: var(--ink-primary);
  color: var(--paper-cream);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,.2);
  z-index: 5;
}
.fab__plus {
  font-size: 60rpx;
  line-height: 1;
  color: var(--paper-cream);
}
```

- [ ] **Step 3: Add `onFabTap` to `index.ts`**

Inside the `Page({...})` methods block (after `onCardTap`):

```typescript
  onFabTap() {
    wx.navigateTo({ url: '/pkgUpload/new/index' });
  },
```

- [ ] **Step 4: Verify tsc + tests**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Test count unchanged at **105**.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/pages/timeline
git commit -m "feat(miniapp): timeline FAB to launch upload flow"
```

---

## Task 11: End-to-end smoke test

**Files:** Modify `apps/api/tsconfig.json` + Create `apps/api/tests/wechat/miniapp-upload.test.ts`.

Cross-package smoke. Exercises:
1. `uploadsService.requestTokens({ ext, count, collectionDraftId })` against real Fastify
2. `collectionsService.byTitle(title)` (no match → null)
3. `collectionsService.create(body)` end-to-end — verifies the created collection appears in `collectionsService.list()`
4. `collectionsService.append(id, body)` — verifies appended photos are present

We do NOT exercise the real Qiniu upload — that requires a live Qiniu account. The Fastify storage provider returns a fake token at test time via the `LocalStorage` test provider (already used by every other api test). For the create/append tests, we just provide a synthetic `fileKey` directly, as if Qiniu had already returned it.

### Step 1: Extend `apps/api/tsconfig.json#exclude`

```json
{
  "exclude": [
    "tests/wechat/miniapp-integration.test.ts",
    "tests/wechat/miniapp-browse.test.ts",
    "tests/wechat/miniapp-tags.test.ts",
    "tests/wechat/miniapp-upload.test.ts"
  ]
}
```

### Step 2: Create the smoke test

`apps/api/tests/wechat/miniapp-upload.test.ts`:

```typescript
// Cross-package integration test that imports miniapp source. Excluded from
// the api's tsc build via tsconfig.json#exclude.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { hashPassword } from '../../src/auth/password.js';
import { signAccess } from '../../src/auth/jwt.js';
import {
  installWxMock,
  uninstallWxMock,
  type WxMock,
} from '../../../miniapp/tests/helpers/wxMock.js';
import { authStore } from '../../../miniapp/miniprogram/stores/authStore.js';
import { uploadsService } from '../../../miniapp/miniprogram/lib/services/uploads.js';
import { collectionsService } from '../../../miniapp/miniprogram/lib/services/collections.js';

describe('miniapp upload — end-to-end against real Fastify', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;

  beforeEach(async () => {
    mock = installWxMock();
    ctx = await buildApp();
    authStore.reset();

    const user = await ctx.prisma.user.create({
      data: {
        username: 'uploader',
        displayName: 'Uploader',
        passwordHash: await hashPassword('uploaderpw123'),
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

  it('uploadsService.requestTokens mints N tokens with the right key shape', async () => {
    const tokens = await uploadsService.requestTokens({
      ext: 'jpg', count: 3, collectionDraftId: 'draft-test-1',
    });
    expect(tokens.length).toBe(3);
    for (const t of tokens) {
      expect(typeof t.token).toBe('string');
      expect(t.key).toMatch(/^photos\/draft-test-1\/.+\.jpg$/);
      expect(typeof t.uploadUrl).toBe('string');
    }
  });

  it('collectionsService.byTitle returns null collection when no match', async () => {
    const res = await collectionsService.byTitle('nothing-here');
    expect(res.collection).toBeNull();
    expect(res.matches).toEqual([]);
  });

  it('collectionsService.create returns the new collection and surfaces via list', async () => {
    const created = await collectionsService.create({
      title: 'Spring trip',
      description: null,
      occurredOn: '2026-05-01',
      occurredUntil: null,
      location: null,
      tags: ['户外'],
      photos: [{ fileKey: 'k-1', width: 1600, height: 1200, caption: null, takenAt: null, tags: [] }],
    });
    expect(created.title).toBe('Spring trip');

    const list = await collectionsService.list({ limit: 10 });
    expect(list.items.map((c) => c.title)).toContain('Spring trip');
  });

  it('collectionsService.byTitle finds an exact match after create', async () => {
    await collectionsService.create({
      title: 'Summer beach',
      description: null,
      occurredOn: '2026-06-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [{ fileKey: 'k-s', width: 1000, height: 800, caption: null, takenAt: null, tags: [] }],
    });
    const res = await collectionsService.byTitle('Summer beach');
    expect(res.collection).not.toBeNull();
    expect(res.collection?.title).toBe('Summer beach');
  });

  it('collectionsService.append adds photos to an existing collection', async () => {
    const created = await collectionsService.create({
      title: 'Birthday',
      description: null,
      occurredOn: '2026-07-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [{ fileKey: 'k-a', width: 1000, height: 800, caption: null, takenAt: null, tags: [] }],
    });
    const after = await collectionsService.append(created.id, {
      photos: [
        { fileKey: 'k-b', width: 1000, height: 800, caption: null, takenAt: null, tags: [] },
        { fileKey: 'k-c', width: 1000, height: 800, caption: null, takenAt: null, tags: [] },
      ],
      extraTags: ['庆祝'],
    });
    expect(after.photos.length).toBe(3);
  });
});
```

### Step 3: Run the focused test

```bash
pnpm --filter @daynest/api test -- miniapp-upload
```

Expected: 5 pass.

### Step 4: Run the full api suite

```bash
pnpm --filter @daynest/api test
```

Expected: previous **167** + 5 = **172**.

### Step 5: Run the miniapp suite + builds

```bash
pnpm --filter @daynest/miniapp test
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/api build
pnpm --filter @daynest/shared build
```

Expected: **105** miniapp tests, all builds clean.

### Step 6: Commit

```bash
git add apps/api/tests/wechat/miniapp-upload.test.ts apps/api/tsconfig.json
git commit -m "test(miniapp): end-to-end smoke for upload pipeline (tokens + create + append + byTitle)"
```

---

## Post-plan verification (manual)

After all 11 commits, smoke-test in WeChat DevTools:

1. Boot the api:
   ```bash
   pnpm --filter @daynest/api dev
   ```

2. Open DevTools → `apps/miniapp/` → 不校验合法域名.

3. Walk through:
   - Timeline → tap `+` FAB → upload page opens fresh.
   - Tap "+" cell → pick 3 photos. Verify thumbnails appear with `queued` state.
   - First photo's EXIF should default the date picker (if the chosen image has DateTimeOriginal).
   - Type a title. Confirm the title doesn't truncate during Chinese IME (the page uses raw `bindinput`; if it's noticeably bad we'd add `useIMEDebouncedValue` — but for now the debounce is only used for the fuzzy lookup, not for setData, so IME is fine).
   - Type the title of an existing collection — observe the "已存在「X」 合并" toggle appear. Flip it on. Verify the submit button label changes to "加入「X」".
   - Add a few tags via the tag-picker. Tap a suggestion. Type a new one and press 完成.
   - Tap 创建集合 / 加入. Watch the progress bar tick. Verify each photo's overlay flips compressing → uploading X% → ✓.
   - On success: toast + auto-navigateBack. Verify the new/updated collection appears on the timeline.

4. Failure modes worth poking:
   - Cancel `wx.chooseMedia` → no toast.
   - Submit with 0 photos → button is disabled.
   - Submit with 0 title → button is disabled.
   - Force a Qiniu 401 by tampering with the token (e.g., via DevTools network mock) → failed overlay appears.

---

## Self-Review

**Spec coverage** (against `2026-05-22-miniapp-design.md`):
- §3.3 Upload page tree (`pkgUpload/new/index`) — Task 9 ✅
- §4.6 Pipeline (pick → exif → compress → token → upload → commit) — Tasks 1–9 ✅
- §5.2 Wire contracts (POST `/api/uploads/token`, POST `/api/collections`, POST `/api/collections/:id/append`, GET `/api/collections/by-title`) — Tasks 4, 5 ✅
- User-specified concurrency = 10 — Task 9 (`QUEUE_CONCURRENCY = 10`) ✅
- User-specified EXIF from original — Task 1 + Task 9 (`tryDefaultDateFrom` reads from `originalPath`) ✅
- Client-side compression — Tasks 2 + 9 ✅

**Type consistency:**
- `CollectionCreateInput` / `CollectionAppendInput` from `@daynest/shared` — used unchanged.
- `PhotoInput` (required `fileKey`, optional `caption`, `takenAt`, `tags`) — matched at the call site.
- Qiniu `returnBody` shape matches `apps/api/src/storage/qiniu.ts:43-49` (`key`, `hash`, `size`, `width`, `height`).

**Plan boundary check:**
- Tasks 1–7 are foundations + components; Tasks 8–10 wire into the existing app; Task 11 is the cross-package smoke. Order is intentional — page comes AFTER its dependencies, FAB last.

**Placeholder scan:**
- No `TODO` / `later` / `implement appropriate error handling`.
- Every code block is complete.
- Every command has expected output.

---

## Done criteria

- `pnpm --filter @daynest/miniapp test` → **105 passing** (74 baseline + 4 exif + 4 compress + 4 queue + 5 uploads + 4 collections.write + 7 uploadStore + 3 tag-picker)
- `pnpm --filter @daynest/api test` → **172 passing** (167 baseline + 5 new smoke)
- `pnpm --filter @daynest/shared test` → **22 passing** (unchanged)
- All three builds clean
- Manual DevTools verification (Post-plan section) succeeds

—— end of plan
