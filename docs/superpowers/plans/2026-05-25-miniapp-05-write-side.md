# Mini-Program v1 — Plan 05 · Write-Side (Upload + Profile + Invites + Subscribe-at-Favorite)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the entire write-side of the mini-program: photo upload + new-collection creation (with merge-into-existing detection), profile editing, invite sharing, and WeChat one-time subscribe-message prompts wired at favorite-time. After Plan 05 the mini-program is feature-complete except for share / fonts / final polish (Plan 06).

**Architecture:**

- **Upload pipeline** mirrors the web's `apps/web/src/lib/upload.ts`:
  - Pure-JS concurrency pool (`lib/pool.ts`, port of the web's `pool`)
  - Minimal JPEG APP1 / EXIF DateTimeOriginal extractor (`lib/exif.ts`, ~120 LOC)
  - `wx.compressImage` promisified wrapper (`lib/imageCompress.ts`)
  - `lib/localPhoto.ts` orchestrator — `chooseMedia(sizeType: ['original'])` → read EXIF off ORIGINAL → `wx.getImageInfo` → optional compress → `LocalPhoto`
  - `uploadsService.requestTokens()` → wraps `POST /api/uploads/token`
  - `uploadsService.uploadToQiniu(bundle, tempFilePath, onProgress)` → wraps `wx.uploadFile`
- **New-collection page** at `pkgUpload/new-collection/index`:
  - Title input → debounced `GET /api/collections/by-title` for merge candidates
  - Date / location / description / tag inputs
  - Photo picker (`wx.chooseMedia({ count: 9, sizeType: ['original'] })`, multi-call append)
  - Per-photo progress UI, retry-failed button, aggregate progress
  - Submit → `POST /api/collections` (new) or `POST /api/collections/:id/append` (merge)
- **Profile page** rebuild — current `pages/me/index` is a 6-line stub; ship a real one with avatar, login name (read-only), display name (editable inline), WeChat bind status, invite entry, logout.
- **Invites** — `invitesService.create()` calls `POST /api/invites` returning `{ token, expiresAt }`. UI shows a copy-to-clipboard button + a share-to-friend hook via `onShareAppMessage` (deferred to Plan 06 release polish; Plan 05 just exposes the copy/QR path).
- **Subscribe-at-favorite** — when the user toggles a favorite ON (not off), fire-and-forget `wx.requestSubscribeMessage({ tmplIds: [NEW_PHOTO] })`; on user-accept, fire-and-forget `POST /api/wechat/subscribe`. The favorite mutation does NOT await any of this — the subscribe ladder is purely opportunistic.

**Tech Stack:** Native WXML/WXSS/JS · TypeScript · Vitest · `@daynest/shared` DTOs · existing infrastructure from Plans 02–04 (`createApiClient`, `authStore`, `themeStore`, `_http.ts`, `apiClient`).

**Companion spec:** [`../specs/2026-05-22-miniapp-design.md`](../specs/2026-05-22-miniapp-design.md) — §3.2 (page tree, `pkgUpload`), §3.3 (upload pipeline), §4.3 (subscribe prompts), §4.7 (settings).

**Backend dependency:** All endpoints already on `main`:
- `POST /api/uploads/token` body `{ ext, count, collectionDraftId? }` → `{ tokens: UploadTokenBundle[] }`
- `POST /api/collections` body matches `CollectionCreateInput` from `@daynest/shared`
- `POST /api/collections/:id/append` body matches `CollectionAppendInput`
- `GET /api/collections/by-title?title=<>` → `{ collection, directTags, matches: [{ collection, directTags, score, matchType }] }`
- `PATCH /api/auth/me` body `{ displayName? }` → `{ user: UserDTO }`
- `POST /api/invites` (no body) → `{ token, expiresAt }`
- `POST /api/wechat/subscribe` body `{ accepted: WechatTemplateId[] }` → `{ ok, recorded }`

Plan 05 **does not touch `apps/api/`** (verified — every endpoint above is already in production).

**Scope of this plan:**

| # | Theme | Deliverables |
|---|---|---|
| 1–5 | Upload primitives | pool · exif · imageCompress · localPhoto · uploadsService |
| 6 | Subpackage | pkgUpload registration + preloadRule |
| 7–9 | New-collection page | form + merge-detect + submit |
| 10–11 | Profile | meService · settings page |
| 12–13 | Invites | invitesService · invite entry on settings |
| 14 | Subscribe | subscribe helper + wire into favorite toggle (detail + viewer) |
| 15 | Smoke test | upload-tokens + create-collection happy path via real Fastify + FakeStorage |

**Out of scope (Plan 06):**
- ❌ `onShareAppMessage` per-page share cards
- ❌ Real font subsetting / `wx.loadFontFace`
- ❌ Final QA polish + DevTools privacy/perf passes
- ❌ Photo-caption editing inside the viewer (deferred; v1 allows captions only at upload time)
- ❌ Cover-photo selection in new-collection page (uses photos[0] as cover by default)
- ❌ Avatar upload (display only — uses initial-letter chip like the web)

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `apps/miniapp/miniprogram/lib/pool.ts` | concurrency pool (port of web's `pool`) |
| `apps/miniapp/miniprogram/lib/exif.ts` | JPEG APP1 → DateTimeOriginal extractor |
| `apps/miniapp/miniprogram/lib/imageCompress.ts` | `wx.compressImage` promisified |
| `apps/miniapp/miniprogram/lib/localPhoto.ts` | chooseMedia → exif → dims → compress |
| `apps/miniapp/miniprogram/lib/services/uploads.ts` | tokens + wx.uploadFile orchestration |
| `apps/miniapp/miniprogram/lib/services/me.ts` | PATCH /api/auth/me wrapper |
| `apps/miniapp/miniprogram/lib/services/invites.ts` | POST /api/invites wrapper |
| `apps/miniapp/miniprogram/lib/subscribe.ts` | `wx.requestSubscribeMessage` + POST `/api/wechat/subscribe` |
| `apps/miniapp/miniprogram/pkgUpload/new-collection/index.{ts,wxml,wxss,json}` | New-collection form page |
| `apps/miniapp/tests/lib/pool.test.ts` | pool tests |
| `apps/miniapp/tests/lib/exif.test.ts` | EXIF parser tests |
| `apps/miniapp/tests/lib/imageCompress.test.ts` | compress wrapper tests |
| `apps/miniapp/tests/lib/localPhoto.test.ts` | localPhoto orchestrator tests |
| `apps/miniapp/tests/lib/services/uploads.test.ts` | uploads service tests |
| `apps/miniapp/tests/lib/services/me.test.ts` | meService tests |
| `apps/miniapp/tests/lib/services/invites.test.ts` | invitesService tests |
| `apps/miniapp/tests/lib/subscribe.test.ts` | subscribe helper tests |
| `apps/api/tests/wechat/miniapp-upload.test.ts` | cross-package smoke test |

### Modified files

| Path | Change |
|---|---|
| `apps/miniapp/miniprogram/lib/services/collections.ts` | add `findByTitle(title)` wrapping `GET /api/collections/by-title` + `create(input)` / `appendPhotos(id, input)` |
| `apps/miniapp/miniprogram/lib/endpoints.ts` | add `uploadsToken`, `byTitle`, `collections`, `collectionAppend`, `invites` |
| `apps/miniapp/miniprogram/app.json` | register `pkgUpload` subpackage + wifi-preload from timeline |
| `apps/miniapp/miniprogram/pages/me/index.{ts,wxml,wxss,json}` | rebuild as real settings page |
| `apps/miniapp/miniprogram/custom-tab-bar/index.{ts,wxml,wxss}` | (if needed) add a fifth "upload" entry — see Task 6 design note |
| `apps/miniapp/miniprogram/pkgCollection/detail/index.ts` | route favorite-on to `subscribe.maybePromptForFavorite()` |
| `apps/miniapp/miniprogram/pkgCollection/viewer/index.ts` | same wiring as detail |
| `apps/api/tsconfig.json` | add `miniapp-upload.test.ts` to `exclude` |

### Files NOT touched
- `apps/api/src/**` — backend frozen for Plan 05
- `packages/shared/src/**` — no DTO changes (DTOs already cover the write surface)
- All pages from Plans 03/04 except those in the table above

---

## Conventions

- **TDD where testable** — every `lib/*.ts` + `services/*.ts` gets tests first.
- **Run tests:** `pnpm --filter @daynest/miniapp test` (miniapp), `pnpm --filter @daynest/api test` (api).
- **Typecheck:** `pnpm --filter @daynest/miniapp build` and `pnpm --filter @daynest/api build`.
- **API access discipline:** pages call `*Service.*`, never `apiClient.request` directly.
- **Component-import discipline:** every page using a Component declares it in `index.json` `usingComponents`.
- **WXSS units:** `rpx` only (except `1px` hairlines and `100vh`).
- **Commits:** Conventional Commits (`feat(miniapp):`, `test(miniapp):`, etc).
- **Baseline before Plan 05:** miniapp 74 / api 167 / shared 22 passing; tsc clean across all three.

---

## Task 1: `lib/pool.ts` concurrency pool + tests

**Files:**
- Create: `apps/miniapp/miniprogram/lib/pool.ts`
- Create: `apps/miniapp/tests/lib/pool.test.ts`

Port of `apps/web/src/lib/upload.ts#pool` — run `worker` over each item with up to `concurrency` in flight at once, results in input order, throw on first error (after letting in-flight tasks complete). The uploads service uses this with `concurrency: 10`.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/pool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { pool } from '../../miniprogram/lib/pool.js';

describe('pool', () => {
  it('returns results in input order', async () => {
    const items = [10, 30, 20, 40];
    const got = await pool(items, 2, async (n, i) => {
      await new Promise((r) => setTimeout(r, n));
      return `${i}:${n}`;
    });
    expect(got).toEqual(['0:10', '1:30', '2:20', '3:40']);
  });

  it('limits concurrency', async () => {
    let inFlight = 0;
    let maxSeen = 0;
    await pool([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight += 1;
      if (inFlight > maxSeen) maxSeen = inFlight;
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return 0;
    });
    expect(maxSeen).toBeLessThanOrEqual(2);
  });

  it('throws on first error but lets in-flight finish', async () => {
    let started = 0;
    let completed = 0;
    const items = [1, 2, 3, 4];
    await expect(
      pool(items, 2, async (n) => {
        started += 1;
        await new Promise((r) => setTimeout(r, n * 5));
        if (n === 2) throw new Error('boom');
        completed += 1;
      }),
    ).rejects.toThrow(/boom/);
    expect(started).toBeGreaterThanOrEqual(2);
    // The pool should NOT have started item 4 once item 2 failed; item 1
    // may or may not have completed depending on timing.
    expect(completed).toBeLessThanOrEqual(2);
  });

  it('handles empty input', async () => {
    const got = await pool<number, number>([], 4, async () => 0);
    expect(got).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — must fail** (`pnpm --filter @daynest/miniapp test`).

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/pool.ts`**

```typescript
/**
 * Run `worker` over each item with up to `concurrency` in flight at once.
 * Returns results in the same order as inputs. Throws on the first error
 * (after letting in-flight tasks complete).
 *
 * Mirror of `apps/web/src/lib/upload.ts#pool` — keep behaviour identical so
 * the upload pipelines on web and mini-app stay coherent.
 */
export async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let firstError: unknown = null;
  const runOne = async () => {
    while (cursor < items.length && firstError === null) {
      const i = cursor++;
      try {
        results[i] = await worker(items[i] as T, i);
      } catch (e) {
        if (firstError === null) firstError = e;
      }
    }
  };
  const lanes = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: lanes }, runOne));
  if (firstError) throw firstError;
  return results;
}
```

- [ ] **Step 4: Run — must pass** (prior 74 + 4 = **78**).

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/pool.ts apps/miniapp/tests/lib/pool.test.ts
git commit -m "feat(miniapp): concurrency pool util (port of web upload pool)"
```

---

## Task 2: `lib/exif.ts` JPEG EXIF DateTimeOriginal reader + tests

**Files:**
- Create: `apps/miniapp/miniprogram/lib/exif.ts`
- Create: `apps/miniapp/tests/lib/exif.test.ts`

Mini-programs have no battle-tested EXIF parser library. The format we need is narrow: JPEG → APP1 segment → "Exif\0\0" header → TIFF IFD0 → Exif SubIFD → tag 0x9003 DateTimeOriginal (ASCII "YYYY:MM:DD HH:MM:SS"). We ship a minimal hand-rolled parser that returns the date as an ISO 8601 string, or `null` if the photo isn't a JPEG or doesn't carry DateTimeOriginal.

The implementation works on `ArrayBuffer`. The caller obtains an ArrayBuffer from the chosen file via `wx.getFileSystemManager().readFile({ filePath, success: ({ data }) => ... })` — `data` is an `ArrayBuffer` when no `encoding` is set.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/exif.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readJpegTakenAt } from '../../miniprogram/lib/exif.js';

/**
 * Build a tiny synthetic JPEG with a minimal APP1/EXIF block carrying a
 * DateTimeOriginal tag. Returns an ArrayBuffer the parser can consume.
 */
function buildJpegWithExif(opts: {
  dateTimeOriginal?: string;       // "YYYY:MM:DD HH:MM:SS"
  byteOrder?: 'big' | 'little';
  omitDateTag?: boolean;
}): ArrayBuffer {
  const dto = opts.dateTimeOriginal ?? '2024:07:15 12:30:45';
  const dtoBytes = new TextEncoder().encode(dto + '\0'); // null-terminated

  // Layout:
  //   FFD8                              SOI
  //   FFE1 <len:2>                      APP1
  //   "Exif\0\0"                        Exif identifier (6 bytes)
  //   "II" or "MM"                      TIFF byte order
  //   0x002A                            magic
  //   0x00000008                        offset to IFD0 (8 from TIFF start)
  //   IFD0 (1 entry): ExifIFDPointer    0x8769, type=LONG(4), count=1, value=<offset to ExifIFD>
  //     followed by next-IFD offset = 0
  //   ExifIFD (1 entry): DateTimeOriginal 0x9003, type=ASCII(2), count=<len incl NUL>, value=<offset to ascii bytes>
  //     followed by next-IFD offset = 0
  //   <ascii dto bytes>

  // We'll compute offsets bottom-up.
  const tiffBO = opts.byteOrder ?? 'little';
  const u = (n: number, bytes: 2 | 4): number[] => {
    const arr: number[] = [];
    if (tiffBO === 'little') {
      for (let i = 0; i < bytes; i++) arr.push((n >>> (i * 8)) & 0xff);
    } else {
      for (let i = bytes - 1; i >= 0; i--) arr.push((n >>> (i * 8)) & 0xff);
    }
    return arr;
  };

  const ifd0EntryCount = 1;
  const exifIfdEntryCount = opts.omitDateTag ? 0 : 1;

  // Sizes of fixed parts:
  // ifd0 = 2 (count) + 12*entries + 4 (nextIfdOffset)
  // exifIfd same shape
  const ifd0Size = 2 + 12 * ifd0EntryCount + 4;
  const exifIfdOffsetFromTiff = 8 + ifd0Size; // immediately after IFD0

  // Ascii blob lives right after the ExifIFD.
  const exifIfdSize = 2 + 12 * exifIfdEntryCount + 4;
  const asciiOffsetFromTiff = exifIfdOffsetFromTiff + exifIfdSize;

  const tiff: number[] = [];
  // TIFF header
  if (tiffBO === 'little') tiff.push(0x49, 0x49); else tiff.push(0x4d, 0x4d);
  tiff.push(...u(0x002a, 2));
  tiff.push(...u(0x00000008, 4));
  // IFD0: ExifIFDPointer
  tiff.push(...u(ifd0EntryCount, 2));
  tiff.push(...u(0x8769, 2));     // tag
  tiff.push(...u(4, 2));          // type LONG
  tiff.push(...u(1, 4));          // count
  tiff.push(...u(exifIfdOffsetFromTiff, 4)); // value = offset
  tiff.push(...u(0, 4));          // next-IFD offset = 0
  // ExifIFD
  tiff.push(...u(exifIfdEntryCount, 2));
  if (!opts.omitDateTag) {
    tiff.push(...u(0x9003, 2));   // DateTimeOriginal
    tiff.push(...u(2, 2));        // ASCII
    tiff.push(...u(dtoBytes.length, 4));
    tiff.push(...u(asciiOffsetFromTiff, 4));
  }
  tiff.push(...u(0, 4));          // next-IFD = 0
  // ASCII blob
  tiff.push(...Array.from(dtoBytes));

  // APP1 segment length (excludes the FFE1 marker itself; includes the 2 length bytes)
  const exifId = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const app1Body = [...exifId, ...tiff];
  const app1Len = app1Body.length + 2; // +2 for the length field

  const out: number[] = [];
  out.push(0xff, 0xd8);
  out.push(0xff, 0xe1);
  out.push((app1Len >>> 8) & 0xff, app1Len & 0xff);
  out.push(...app1Body);
  out.push(0xff, 0xd9); // EOI

  return new Uint8Array(out).buffer;
}

describe('readJpegTakenAt', () => {
  it('extracts DateTimeOriginal from a little-endian JPEG', () => {
    const buf = buildJpegWithExif({ dateTimeOriginal: '2024:07:15 12:30:45' });
    expect(readJpegTakenAt(buf)).toBe('2024-07-15T12:30:45');
  });

  it('extracts DateTimeOriginal from a big-endian JPEG', () => {
    const buf = buildJpegWithExif({
      dateTimeOriginal: '2026:01:02 03:04:05',
      byteOrder: 'big',
    });
    expect(readJpegTakenAt(buf)).toBe('2026-01-02T03:04:05');
  });

  it('returns null when DateTimeOriginal is missing', () => {
    const buf = buildJpegWithExif({ omitDateTag: true });
    expect(readJpegTakenAt(buf)).toBeNull();
  });

  it('returns null for non-JPEG data', () => {
    // 4 bytes of garbage — no SOI marker
    const buf = new Uint8Array([0x00, 0x11, 0x22, 0x33]).buffer;
    expect(readJpegTakenAt(buf)).toBeNull();
  });

  it('returns null when DateTimeOriginal is malformed', () => {
    const buf = buildJpegWithExif({ dateTimeOriginal: 'not-a-date-at-all' });
    expect(readJpegTakenAt(buf)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — must fail.**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/exif.ts`**

```typescript
/**
 * Minimal JPEG EXIF DateTimeOriginal extractor for the mini-program.
 *
 * We intentionally support a NARROW subset of the format:
 *   - JPEG only (SOI = FFD8)
 *   - One APP1 (FFE1) segment carrying the "Exif\0\0" identifier
 *   - TIFF IFD0 with an ExifIFDPointer (tag 0x8769)
 *   - ExifIFD with a DateTimeOriginal (tag 0x9003)
 *
 * Anything else returns `null`. We do not try to be a general-purpose
 * EXIF reader — when EXIF parsing fails, the caller falls back to "today"
 * for the photo's `takenAt`, which matches the web behaviour.
 *
 * Returns the date as an ISO-like string WITHOUT timezone offset
 * (e.g. "2024-07-15T12:30:45") since EXIF DateTimeOriginal carries no
 * timezone information. The api accepts this and stores it as a local-
 * time UTC datetime; downstream consumers treat it as a wall-clock value.
 */
export function readJpegTakenAt(buffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4) return null;
    // SOI
    if (view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return null;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      // Each segment starts with 0xFF then a marker byte != 0x00 / 0xFF
      if (view.getUint8(offset) !== 0xff) return null;
      const marker = view.getUint8(offset + 1);
      offset += 2;
      // Markers without payload
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > view.byteLength) return null;
      const segLen = view.getUint16(offset, false); // segment length is big-endian
      if (segLen < 2 || offset + segLen > view.byteLength) return null;
      // APP1
      if (marker === 0xe1) {
        const result = readApp1(view, offset + 2, segLen - 2);
        if (result) return result;
      }
      offset += segLen;
    }
    return null;
  } catch {
    return null;
  }
}

function readApp1(view: DataView, start: number, length: number): string | null {
  if (length < 14) return null;
  // "Exif\0\0"
  if (
    view.getUint8(start) !== 0x45 ||
    view.getUint8(start + 1) !== 0x78 ||
    view.getUint8(start + 2) !== 0x69 ||
    view.getUint8(start + 3) !== 0x66 ||
    view.getUint8(start + 4) !== 0x00 ||
    view.getUint8(start + 5) !== 0x00
  ) {
    return null;
  }
  const tiffStart = start + 6;
  // Byte order: II = little-endian, MM = big-endian
  const bom0 = view.getUint8(tiffStart);
  const bom1 = view.getUint8(tiffStart + 1);
  let little: boolean;
  if (bom0 === 0x49 && bom1 === 0x49) little = true;
  else if (bom0 === 0x4d && bom1 === 0x4d) little = false;
  else return null;
  const magic = view.getUint16(tiffStart + 2, little);
  if (magic !== 0x002a) return null;
  const ifd0Offset = view.getUint32(tiffStart + 4, little);
  const exifIfdOffset = findExifIfdOffset(view, tiffStart, ifd0Offset, little);
  if (exifIfdOffset == null) return null;
  return findDateTimeOriginal(view, tiffStart, exifIfdOffset, little);
}

function findExifIfdOffset(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
): number | null {
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > view.byteLength) return null;
  const count = view.getUint16(ifdStart, little);
  for (let i = 0; i < count; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) return null;
    const tag = view.getUint16(entry, little);
    if (tag === 0x8769) {
      return view.getUint32(entry + 8, little);
    }
  }
  return null;
}

function findDateTimeOriginal(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
): string | null {
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > view.byteLength) return null;
  const count = view.getUint16(ifdStart, little);
  for (let i = 0; i < count; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) return null;
    const tag = view.getUint16(entry, little);
    if (tag !== 0x9003) continue;
    const type = view.getUint16(entry + 2, little);
    const len = view.getUint32(entry + 4, little);
    if (type !== 2) return null; // ASCII
    // For ASCII values longer than 4 bytes, entry bytes 8..12 hold an
    // offset (from tiffStart). Shorter values are stored inline. Always
    // treat as offset here because DateTimeOriginal is "YYYY:MM:DD HH:MM:SS\0"
    // which is 20 bytes — never inline.
    const valueOffset = view.getUint32(entry + 8, little);
    const stringStart = tiffStart + valueOffset;
    if (stringStart + len > view.byteLength) return null;
    const bytes = new Uint8Array(view.buffer, view.byteOffset + stringStart, len);
    let text = new TextDecoder('utf-8').decode(bytes);
    // Strip trailing NULs
    text = text.replace(/\0+$/g, '');
    return parseExifDateTime(text);
  }
  return null;
}

function parseExifDateTime(s: string): string | null {
  // Format: "YYYY:MM:DD HH:MM:SS"
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}
```

- [ ] **Step 4: Run — must pass** (78 + 5 = **83**).

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/exif.ts apps/miniapp/tests/lib/exif.test.ts
git commit -m "feat(miniapp): minimal JPEG EXIF DateTimeOriginal extractor"
```

---

## Task 3: `lib/imageCompress.ts` wrapper + tests

**Files:**
- Create: `apps/miniapp/miniprogram/lib/imageCompress.ts`
- Create: `apps/miniapp/tests/lib/imageCompress.test.ts`

Promisified wrapper around `wx.compressImage`. Returns the compressed tempFilePath. Falls back to the original tempFilePath on error (compression is opportunistic — a too-small or already-compressed file may fail to compress further, and we shouldn't fail the whole upload).

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/imageCompress.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock } from '../helpers/wxMock.js';
import { compressImageToPath } from '../../miniprogram/lib/imageCompress.js';

describe('compressImageToPath', () => {
  beforeEach(() => { installWxMock(); });
  afterEach(() => { uninstallWxMock(); });

  it('resolves with wx.compressImage tempFilePath on success', async () => {
    (globalThis as Record<string, unknown>).wx = {
      ...(globalThis as Record<string, unknown>).wx as object,
      compressImage: (o: {
        src: string;
        quality?: number;
        success: (r: { tempFilePath: string }) => void;
        fail: (e: unknown) => void;
      }) => {
        Promise.resolve().then(() => o.success({ tempFilePath: o.src + '.compressed' }));
      },
    };
    const out = await compressImageToPath('/tmp/x.jpg', 80);
    expect(out).toBe('/tmp/x.jpg.compressed');
  });

  it('falls back to the original path when wx.compressImage fails', async () => {
    (globalThis as Record<string, unknown>).wx = {
      ...(globalThis as Record<string, unknown>).wx as object,
      compressImage: (o: {
        src: string;
        success: (r: { tempFilePath: string }) => void;
        fail: (e: unknown) => void;
      }) => {
        Promise.resolve().then(() => o.fail(new Error('compress failed')));
      },
    };
    const out = await compressImageToPath('/tmp/y.jpg', 80);
    expect(out).toBe('/tmp/y.jpg');
  });

  it('clamps quality to the [0, 100] range', async () => {
    let receivedQuality: number | undefined;
    (globalThis as Record<string, unknown>).wx = {
      ...(globalThis as Record<string, unknown>).wx as object,
      compressImage: (o: {
        src: string;
        quality?: number;
        success: (r: { tempFilePath: string }) => void;
        fail: (e: unknown) => void;
      }) => {
        receivedQuality = o.quality;
        Promise.resolve().then(() => o.success({ tempFilePath: o.src }));
      },
    };
    await compressImageToPath('/tmp/z.jpg', 150);
    expect(receivedQuality).toBe(100);
    await compressImageToPath('/tmp/z.jpg', -10);
    expect(receivedQuality).toBe(0);
  });
});
```

- [ ] **Step 2: Run — must fail.**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/imageCompress.ts`**

```typescript
/**
 * Promisified wrapper around `wx.compressImage`. Returns the compressed
 * `tempFilePath` on success, or the input path on failure (compression is
 * opportunistic — never fail the upload because compression failed).
 *
 * `quality` is clamped to [0, 100] per WX contract.
 */
export function compressImageToPath(src: string, quality: number): Promise<string> {
  const q = Math.max(0, Math.min(100, Math.floor(quality)));
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: q,
      success: (r) => resolve(r.tempFilePath || src),
      fail: () => resolve(src),
    });
  });
}
```

- [ ] **Step 4: Run — must pass** (83 + 3 = **86**).

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/imageCompress.ts apps/miniapp/tests/lib/imageCompress.test.ts
git commit -m "feat(miniapp): wx.compressImage promisified wrapper with fallback"
```

---

## Task 4: `lib/localPhoto.ts` orchestrator + tests

**Files:**
- Create: `apps/miniapp/miniprogram/lib/localPhoto.ts`
- Create: `apps/miniapp/tests/lib/localPhoto.test.ts`

`LocalPhoto` represents a picked-but-not-yet-uploaded photo: original tempFilePath, dimensions, EXIF takenAt, optional caption/tags, status (`pending`/`uploading`/`uploaded`/`failed`), and progress. The orchestrator reads EXIF from the ORIGINAL file (before compression strips it), runs `wx.getImageInfo` for dimensions, then optionally calls `compressImageToPath` to shrink the file, and returns a hydrated `LocalPhoto`.

We compress only when the file size is over a threshold (4 MB, mirroring web). Sized via `wx.getFileSystemManager().getFileInfo()` which returns `size` in bytes.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/localPhoto.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installWxMock, uninstallWxMock } from '../helpers/wxMock.js';
import { hydrateLocalPhoto } from '../../miniprogram/lib/localPhoto.js';

interface WxOverrides {
  getImageInfo?: (o: {
    src: string;
    success: (r: { width: number; height: number; type?: string }) => void;
    fail: (e: unknown) => void;
  }) => void;
  compressImage?: (o: {
    src: string;
    quality?: number;
    success: (r: { tempFilePath: string }) => void;
    fail: (e: unknown) => void;
  }) => void;
  getFileSystemManager?: () => {
    getFileInfo: (o: { filePath: string; success: (r: { size: number }) => void; fail: (e: unknown) => void }) => void;
    readFile: (o: { filePath: string; success: (r: { data: ArrayBuffer }) => void; fail: (e: unknown) => void }) => void;
  };
}

function applyWx(overrides: WxOverrides) {
  (globalThis as Record<string, unknown>).wx = {
    ...(globalThis as Record<string, unknown>).wx as object,
    ...overrides,
  };
}

describe('hydrateLocalPhoto', () => {
  beforeEach(() => { installWxMock(); });
  afterEach(() => { uninstallWxMock(); });

  it('returns a hydrated photo with dims, no exif date, compressed when large', async () => {
    applyWx({
      getImageInfo: (o) => Promise.resolve().then(() => o.success({ width: 4000, height: 3000 })),
      compressImage: (o) => Promise.resolve().then(() => o.success({ tempFilePath: o.src + '.c' })),
      getFileSystemManager: () => ({
        getFileInfo: (o) => Promise.resolve().then(() => o.success({ size: 6 * 1024 * 1024 })),
        readFile: (o) => Promise.resolve().then(() => o.success({ data: new ArrayBuffer(0) })),
      }),
    });
    const out = await hydrateLocalPhoto('/tmp/big.jpg');
    expect(out.tempFilePath).toBe('/tmp/big.jpg.c');
    expect(out.width).toBe(4000);
    expect(out.height).toBe(3000);
    expect(out.takenAt).toBeNull();
    expect(out.status).toBe('pending');
    expect(out.progress).toBe(0);
  });

  it('skips compression for small files', async () => {
    let compressCalls = 0;
    applyWx({
      getImageInfo: (o) => Promise.resolve().then(() => o.success({ width: 500, height: 500 })),
      compressImage: (o) => {
        compressCalls += 1;
        Promise.resolve().then(() => o.success({ tempFilePath: o.src }));
      },
      getFileSystemManager: () => ({
        getFileInfo: (o) => Promise.resolve().then(() => o.success({ size: 100_000 })),
        readFile: (o) => Promise.resolve().then(() => o.success({ data: new ArrayBuffer(0) })),
      }),
    });
    const out = await hydrateLocalPhoto('/tmp/small.jpg');
    expect(compressCalls).toBe(0);
    expect(out.tempFilePath).toBe('/tmp/small.jpg');
  });

  it('reads EXIF off the ORIGINAL file (before compression)', async () => {
    const readSpy = vi.fn((o: {
      filePath: string;
      success: (r: { data: ArrayBuffer }) => void;
      fail: (e: unknown) => void;
    }) => {
      // empty buffer → exif reader returns null
      Promise.resolve().then(() => o.success({ data: new ArrayBuffer(0) }));
    });
    applyWx({
      getImageInfo: (o) => Promise.resolve().then(() => o.success({ width: 800, height: 600 })),
      compressImage: (o) => Promise.resolve().then(() => o.success({ tempFilePath: o.src + '.c' })),
      getFileSystemManager: () => ({
        getFileInfo: (o) => Promise.resolve().then(() => o.success({ size: 6 * 1024 * 1024 })),
        readFile: readSpy,
      }),
    });
    await hydrateLocalPhoto('/tmp/orig.jpg');
    // Read should have happened ONCE, against the original path (not the .c one).
    expect(readSpy).toHaveBeenCalledTimes(1);
    const arg = readSpy.mock.calls[0]?.[0];
    expect(arg?.filePath).toBe('/tmp/orig.jpg');
  });
});
```

- [ ] **Step 2: Run — must fail.**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/localPhoto.ts`**

```typescript
import { readJpegTakenAt } from './exif.js';
import { compressImageToPath } from './imageCompress.js';

export interface LocalPhoto {
  /** Path passed to `wx.uploadFile` — already compressed if applicable. */
  tempFilePath: string;
  /** Display thumbnail in the picker grid (= post-compress path). */
  previewPath: string;
  width: number;
  height: number;
  /** ISO datetime without timezone, or null if not present in EXIF. */
  takenAt: string | null;
  caption: string | null;
  tags: string[];
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  progress: number;
  /** Set after successful upload. */
  fileKey?: string;
  error?: string;
}

const COMPRESS_THRESHOLD_BYTES = 4 * 1024 * 1024;
const COMPRESS_QUALITY = 80;

function getImageInfo(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: (r) => resolve({ width: r.width, height: r.height }),
      fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    });
  });
}

function readFileBuffer(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (r) => resolve(r.data as ArrayBuffer),
      fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    });
  });
}

function getFileSize(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (r) => resolve(r.size),
      fail: () => resolve(0),
    });
  });
}

/**
 * Read EXIF off the ORIGINAL (pre-compression) file, fetch image dimensions,
 * and optionally compress. Returns a `LocalPhoto` ready to upload.
 *
 * Failures inside this function are recoverable — bad EXIF → takenAt=null,
 * bad compress → original path, bad fileinfo → no compression. The only
 * unrecoverable failure is `getImageInfo` (which would prevent valid
 * `width`/`height` on the api PhotoInput); we let that reject.
 */
export async function hydrateLocalPhoto(originalPath: string): Promise<LocalPhoto> {
  // Read EXIF and size in parallel from the ORIGINAL — compression strips
  // EXIF and may rewrite the file body, so this MUST be done first.
  const [size, takenAt, dims] = await Promise.all([
    getFileSize(originalPath),
    readFileBuffer(originalPath).then(readJpegTakenAt).catch(() => null),
    getImageInfo(originalPath),
  ]);

  const finalPath =
    size > COMPRESS_THRESHOLD_BYTES
      ? await compressImageToPath(originalPath, COMPRESS_QUALITY)
      : originalPath;

  return {
    tempFilePath: finalPath,
    previewPath: finalPath,
    width: dims.width,
    height: dims.height,
    takenAt,
    caption: null,
    tags: [],
    status: 'pending',
    progress: 0,
  };
}
```

- [ ] **Step 4: Run — must pass** (86 + 3 = **89**).

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/localPhoto.ts apps/miniapp/tests/lib/localPhoto.test.ts
git commit -m "feat(miniapp): hydrateLocalPhoto — chooseMedia + EXIF + dims + compress"
```

---

## Task 5: `uploadsService` + collections wire extensions + tests

**Files:**
- Modify: `apps/miniapp/miniprogram/lib/services/collections.ts`
- Create: `apps/miniapp/miniprogram/lib/services/uploads.ts`
- Modify: `apps/miniapp/miniprogram/lib/endpoints.ts`
- Create: `apps/miniapp/tests/lib/services/uploads.test.ts`

Three additions:

1. **`uploadsService.requestTokens({ count, ext, collectionDraftId? })`** — POSTs `/api/uploads/token`, returns the bundles array.
2. **`uploadsService.uploadToQiniu(bundle, tempFilePath, onProgress?)`** — invokes `wx.uploadFile`, surfaces per-chunk progress, returns `{ key, hash, size, width, height }`. Returns `{ key: bundle.key }` if Qiniu's response JSON is missing/unparseable (the api re-reads dims via `wx.getImageInfo` on the original anyway).
3. **`collectionsService.findByTitle(title)`** + **`collectionsService.create(input)`** + **`collectionsService.appendPhotos(id, input)`** — three new wrappers for the write surface.

Also add the four new endpoint URLs to `lib/endpoints.ts`.

- [ ] **Step 1: Add endpoint URLs**

Extend `apps/miniapp/miniprogram/lib/endpoints.ts`:

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
  uploadsToken: () => `${resolveApiBase()}/api/uploads/token`,
  collections: () => `${resolveApiBase()}/api/collections`,
  collectionAppend: (id: string) => `${resolveApiBase()}/api/collections/${encodeURIComponent(id)}/append`,
  collectionByTitle: () => `${resolveApiBase()}/api/collections/by-title`,
  invites: () => `${resolveApiBase()}/api/invites`,
};
```

- [ ] **Step 2: Write failing tests for uploads**

`apps/miniapp/tests/lib/services/uploads.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { uploadsService } from '../../../miniprogram/lib/services/uploads.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('uploadsService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  describe('requestTokens', () => {
    it('hits POST /api/uploads/token with body and returns tokens', async () => {
      mock.queueResponse({
        statusCode: 200,
        data: {
          tokens: [
            { token: 't0', key: 'photos/d/0.jpg', uploadUrl: 'https://up.example/1', expiresAt: '2026-01-01T00:00:00Z' },
            { token: 't1', key: 'photos/d/1.jpg', uploadUrl: 'https://up.example/1', expiresAt: '2026-01-01T00:00:00Z' },
          ],
        },
      });
      const tokens = await uploadsService.requestTokens({ count: 2, ext: 'jpg', collectionDraftId: 'd' });
      expect(tokens.length).toBe(2);
      expect(tokens[0]?.key).toBe('photos/d/0.jpg');
      const req = mock.requests[0];
      expect(req?.method).toBe('POST');
      expect(req?.url).toMatch(/\/api\/uploads\/token$/);
      expect(req?.data).toEqual({ count: 2, ext: 'jpg', collectionDraftId: 'd' });
    });

    it('throws on non-2xx with code in message', async () => {
      mock.queueResponse({ statusCode: 400, data: { error: { code: 'VALIDATION_ERROR' } } });
      await expect(
        uploadsService.requestTokens({ count: 1, ext: 'jpg' }),
      ).rejects.toThrow(/VALIDATION_ERROR/);
    });
  });

  describe('uploadToQiniu', () => {
    it('invokes wx.uploadFile with token + key + filePath, resolves with parsed JSON', async () => {
      let captured: {
        url?: string;
        filePath?: string;
        name?: string;
        formData?: Record<string, string>;
      } = {};
      (globalThis as Record<string, unknown>).wx = {
        ...(globalThis as Record<string, unknown>).wx as object,
        uploadFile: (o: {
          url: string;
          filePath: string;
          name: string;
          formData?: Record<string, string>;
          success: (r: { statusCode: number; data: string }) => void;
          fail: (e: unknown) => void;
        }) => {
          captured = { url: o.url, filePath: o.filePath, name: o.name, formData: o.formData };
          Promise.resolve().then(() =>
            o.success({
              statusCode: 200,
              data: JSON.stringify({ key: o.formData?.key, hash: 'abc', size: 12345 }),
            }),
          );
          return {
            onProgressUpdate: () => undefined,
            abort: () => undefined,
          };
        },
      };
      const result = await uploadsService.uploadToQiniu(
        {
          token: 'tkn',
          key: 'photos/draft/photo0.jpg',
          uploadUrl: 'https://up.qiniup.com',
          expiresAt: '2026-01-01T00:00:00Z',
        },
        '/tmp/x.jpg',
      );
      expect(result.key).toBe('photos/draft/photo0.jpg');
      expect(captured.url).toBe('https://up.qiniup.com');
      expect(captured.filePath).toBe('/tmp/x.jpg');
      expect(captured.name).toBe('file');
      expect(captured.formData).toEqual({ token: 'tkn', key: 'photos/draft/photo0.jpg' });
    });

    it('rejects on non-2xx Qiniu response', async () => {
      (globalThis as Record<string, unknown>).wx = {
        ...(globalThis as Record<string, unknown>).wx as object,
        uploadFile: (o: {
          success: (r: { statusCode: number; data: string }) => void;
          fail: (e: unknown) => void;
        }) => {
          Promise.resolve().then(() => o.success({ statusCode: 401, data: 'bad token' }));
          return { onProgressUpdate: () => undefined, abort: () => undefined };
        },
      };
      await expect(
        uploadsService.uploadToQiniu(
          { token: 't', key: 'k', uploadUrl: 'https://x', expiresAt: '2026' },
          '/tmp/x',
        ),
      ).rejects.toThrow(/upload failed/i);
    });

    it('forwards progress updates to the callback', async () => {
      const progress: number[] = [];
      (globalThis as Record<string, unknown>).wx = {
        ...(globalThis as Record<string, unknown>).wx as object,
        uploadFile: (o: {
          success: (r: { statusCode: number; data: string }) => void;
          fail: (e: unknown) => void;
        }) => {
          const task = {
            onProgressUpdate: (cb: (e: { progress: number }) => void) => {
              cb({ progress: 25 });
              cb({ progress: 75 });
              Promise.resolve().then(() =>
                o.success({ statusCode: 200, data: '{}' }),
              );
            },
            abort: () => undefined,
          };
          return task;
        },
      };
      await uploadsService.uploadToQiniu(
        { token: 't', key: 'k', uploadUrl: 'https://x', expiresAt: '2026' },
        '/tmp/x',
        (pct) => progress.push(pct),
      );
      expect(progress).toEqual([25, 75]);
    });
  });
});
```

- [ ] **Step 3: Run — must fail.**

- [ ] **Step 4: Create `apps/miniapp/miniprogram/lib/services/uploads.ts`**

```typescript
import { apiClient } from './_client.js';
import { endpoints } from '../endpoints.js';
import { ensureOk } from './_http.js';

// The api's `UploadTokenBundle` shape (defined in
// apps/api/src/storage/provider.ts) is not exported from @daynest/shared,
// so we declare it locally — it's a stable wire format.
export interface UploadTokenBundle {
  token: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface RequestTokensParams {
  count: number;
  ext: string;
  collectionDraftId?: string;
}

export interface QiniuUploadResult {
  key: string;
  hash?: string;
  size?: number;
  width?: number;
  height?: number;
}

export const uploadsService = {
  async requestTokens(params: RequestTokensParams): Promise<UploadTokenBundle[]> {
    const url = endpoints.uploadsToken();
    const res = await apiClient.request<{ tokens: UploadTokenBundle[] }>({
      url,
      method: 'POST',
      data: params,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data.tokens;
  },

  uploadToQiniu(
    bundle: UploadTokenBundle,
    tempFilePath: string,
    onProgress?: (percent: number) => void,
  ): Promise<QiniuUploadResult> {
    return new Promise((resolve, reject) => {
      const task = wx.uploadFile({
        url: bundle.uploadUrl,
        filePath: tempFilePath,
        name: 'file',
        formData: { token: bundle.token, key: bundle.key },
        success: (r) => {
          if (r.statusCode < 200 || r.statusCode >= 300) {
            reject(new Error(`upload failed (${r.statusCode}): ${r.data}`));
            return;
          }
          let parsed: QiniuUploadResult = { key: bundle.key };
          try {
            const json = JSON.parse(r.data) as Partial<QiniuUploadResult>;
            parsed = { ...parsed, ...json, key: json.key ?? bundle.key };
          } catch {
            // Qiniu returned non-JSON; fall back to the requested key.
          }
          resolve(parsed);
        },
        fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
      });
      if (onProgress) {
        task.onProgressUpdate((evt) => onProgress(evt.progress));
      }
    });
  },
};
```

> **Note:** `UploadTokenBundle` is intentionally declared locally — the api defines it in `apps/api/src/storage/provider.ts` but doesn't re-export it from `@daynest/shared`. If a future plan adds the shared export, we can switch to importing it instead.

- [ ] **Step 5: Extend `apps/miniapp/miniprogram/lib/services/collections.ts`**

Add three methods plus the matching types. The full file should read:

```typescript
import type {
  CollectionSummaryDTO,
  CollectionDetailDTO,
  CollectionCreateInput,
  CollectionAppendInput,
} from '@daynest/shared';
import { apiClient } from './_client.js';
import { ensureOk, qs } from './_http.js';
import { endpoints } from '../endpoints.js';

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

export interface ByTitleMatch {
  collection: CollectionDetailDTO;
  directTags: string[];
  score: number;
  matchType: 'exact' | 'contains' | 'subsequence';
}

export interface CollectionByTitleResponse {
  collection: CollectionDetailDTO | null;
  directTags: string[];
  matches: ByTitleMatch[];
}

export const collectionsService = {
  async list(params: ListCollectionsParams = {}): Promise<ListCollectionsResponse> {
    const url = `${endpoints.collections()}${qs(params as Record<string, string | number | undefined>)}`;
    const res = await apiClient.request<ListCollectionsResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async get(id: string): Promise<CollectionDetailDTO> {
    const url = `${endpoints.collections()}/${encodeURIComponent(id)}`;
    const res = await apiClient.request<CollectionDetailDTO>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async findByTitle(title: string): Promise<CollectionByTitleResponse> {
    const url = `${endpoints.collectionByTitle()}${qs({ title })}`;
    const res = await apiClient.request<CollectionByTitleResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async create(input: CollectionCreateInput): Promise<CollectionDetailDTO> {
    const url = endpoints.collections();
    const res = await apiClient.request<CollectionDetailDTO>({
      url,
      method: 'POST',
      data: input,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data;
  },

  async appendPhotos(id: string, input: CollectionAppendInput): Promise<CollectionDetailDTO> {
    const url = endpoints.collectionAppend(id);
    const res = await apiClient.request<CollectionDetailDTO>({
      url,
      method: 'POST',
      data: input,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data;
  },
};
```

- [ ] **Step 6: Run — must pass** (89 + 5 = **94**).

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp/miniprogram/lib/endpoints.ts \
       apps/miniapp/miniprogram/lib/services/uploads.ts \
       apps/miniapp/miniprogram/lib/services/collections.ts \
       apps/miniapp/tests/lib/services/uploads.test.ts
git commit -m "feat(miniapp): uploads service + collections write-side wrappers"
```

---

## Task 6: `pkgUpload` subpackage + app.json registration

**Files:**
- Modify: `apps/miniapp/miniprogram/app.json`

Register a third subpackage and pre-download it from the timeline tab (the user's primary entry point to "I want to add photos"). Plan 05 has only one page in this subpackage: `new-collection/index`. Plan 06 may add `pkgUpload/share/index` if we ship a separate share-poster page.

- [ ] **Step 1: Extend `subPackages` and `preloadRule`**

```json
{
  "subPackages": [
    { "root": "pkgOnboarding/", "name": "pkgOnboarding", "pages": ["register/index"] },
    { "root": "pkgCollection/", "name": "pkgCollection", "pages": ["detail/index", "viewer/index"] },
    { "root": "pkgTags/",       "name": "pkgTags",       "pages": ["pinboard/index", "rename/index"] },
    { "root": "pkgUpload/",     "name": "pkgUpload",     "pages": ["new-collection/index"] }
  ],
  "preloadRule": {
    "pages/timeline/index": { "network": "wifi", "packages": ["pkgCollection", "pkgUpload"] },
    "pages/tags/index":     { "network": "wifi", "packages": ["pkgTags"] }
  }
}
```

> **Design note re tab-bar:** there is NO new tab-bar entry for upload in Plan 05. The custom tab bar stays at four entries (timeline / favorites / tags / me). The upload entry surfaces as a `+` floating button on the timeline page (added in Task 7's page work — NOT in this task). This matches the web's "compose" UX and keeps the tab bar uncluttered. Re-evaluate in Plan 06 release polish if real users find it.

- [ ] **Step 2: Verify tsc / tests**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Expected: clean, **94 passing** (unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/miniapp/miniprogram/app.json
git commit -m "chore(miniapp): register pkgUpload subpackage + wifi-preload from timeline"
```

---

## Task 7: New-collection page shell (form + photo picker + progress UI)

**Files:**
- Create: `apps/miniapp/miniprogram/pkgUpload/new-collection/index.{ts,wxml,wxss,json}`
- Modify: `apps/miniapp/miniprogram/pages/timeline/index.{wxml,wxss}` — add a floating "+" button that `navigateTo`s into the page

This task lands the page SHELL only (form fields, photo picker grid, per-photo state, progress UI). The wire-up to `findByTitle` (Task 8) and the upload-submit orchestration (Task 9) are layered on top in the next two tasks.

- [ ] **Step 1: Add the timeline "+" button**

Append to `apps/miniapp/miniprogram/pages/timeline/index.wxml`, just before the closing `</view>`:

```html
<view class="fab" bindtap="onComposeTap">＋</view>
```

Append to `apps/miniapp/miniprogram/pages/timeline/index.wxss`:

```css
.fab {
  position: fixed;
  right: 32rpx;
  bottom: 160rpx;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: var(--ink-primary);
  color: var(--paper-cream);
  font-size: 56rpx;
  line-height: 96rpx;
  text-align: center;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,.25);
  z-index: 20;
}
```

Add the handler to `apps/miniapp/miniprogram/pages/timeline/index.ts`:

```typescript
  onComposeTap() {
    wx.navigateTo({ url: '/pkgUpload/new-collection/index' });
  },
```

- [ ] **Step 2: Create `pkgUpload/new-collection/index.json`**

```json
{
  "navigationBarTitleText": "新建集合",
  "usingComponents": {}
}
```

- [ ] **Step 3: Create `pkgUpload/new-collection/index.wxml`**

```html
<view class="page">
  <view class="form">
    <view class="field">
      <text class="field__label">标题</text>
      <input class="field__input" placeholder="给这次记忆起个名字" value="{{title}}" bindinput="onTitleInput" maxlength="100" />
      <view wx:if="{{titleMatches.length > 0 && !mergeTargetId}}" class="merge-hint" bindtap="onShowMatches">
        发现相似集合 · 点击合并
      </view>
      <view wx:if="{{mergeTargetId}}" class="merge-tag">
        将合并到 <text class="merge-tag__name">「{{mergeTargetTitle}}」</text>
        <view class="merge-tag__clear" catchtap="onClearMerge">×</view>
      </view>
    </view>

    <view class="field">
      <text class="field__label">日期</text>
      <picker mode="date" value="{{occurredOn}}" bindchange="onDateChange">
        <view class="field__picker">{{occurredOn}}</view>
      </picker>
    </view>

    <view class="field">
      <text class="field__label">地点</text>
      <input class="field__input" placeholder="可以为空" value="{{location}}" bindinput="onLocationInput" maxlength="80" />
    </view>

    <view class="field">
      <text class="field__label">描述</text>
      <textarea class="field__textarea" placeholder="留一段文字" value="{{description}}" bindinput="onDescriptionInput" maxlength="1000" auto-height />
    </view>

    <view class="field">
      <text class="field__label">标签</text>
      <view class="tags">
        <view wx:for="{{tags}}" wx:key="*this" class="tag-chip">
          #{{item}}
          <text class="tag-chip__x" catchtap="onTagRemove" data-tag="{{item}}">×</text>
        </view>
        <input class="tag-input" placeholder="添加标签" value="{{tagInput}}" bindinput="onTagInput" bindconfirm="onTagConfirm" confirm-type="done" />
      </view>
    </view>
  </view>

  <view class="photos">
    <view class="photos__header">
      <text class="photos__count">{{photos.length}} / 50 张</text>
      <view class="photos__pick" bindtap="onPickPhotos">＋ 添加照片</view>
    </view>
    <view class="photos__grid">
      <view wx:for="{{photos}}" wx:key="tempFilePath" class="tile">
        <image class="tile__img" src="{{item.previewPath}}" mode="aspectFill" />
        <view class="tile__overlay {{item.status}}">
          <text wx:if="{{item.status === 'uploading'}}">{{item.progress}}%</text>
          <text wx:elif="{{item.status === 'uploaded'}}">✓</text>
          <text wx:elif="{{item.status === 'failed'}}">!</text>
        </view>
        <view class="tile__x" catchtap="onRemovePhoto" data-key="{{item.tempFilePath}}">×</view>
      </view>
    </view>
  </view>

  <view class="footer">
    <button class="submit {{canSubmit ? '' : 'submit--disabled'}}" disabled="{{!canSubmit || submitting}}" bindtap="onSubmit">
      {{submitting ? submitLabel : (mergeTargetId ? '合并到现有集合' : '创建集合')}}
    </button>
  </view>
</view>
```

- [ ] **Step 4: Create `pkgUpload/new-collection/index.wxss`**

```css
.page { background: var(--paper-cream); min-height: 100vh; padding: 24rpx 24rpx 200rpx; }
.form { display: flex; flex-direction: column; gap: 18rpx; }
.field { display: flex; flex-direction: column; gap: 8rpx; }
.field__label { font-size: 22rpx; color: var(--ink-secondary); }
.field__input,
.field__picker,
.field__textarea {
  background: #FFFCF5;
  border: 1px solid var(--paper-aged);
  border-radius: 8rpx;
  padding: 16rpx 24rpx;
  font-size: 28rpx;
  color: var(--ink-primary);
}
.field__textarea { min-height: 120rpx; }
.merge-hint {
  align-self: flex-start;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--ink-sticker);
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(0,0,0,.04);
}
.merge-tag {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  align-self: flex-start;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: var(--ink-primary);
  background: var(--paper-aged);
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
}
.merge-tag__name { font-weight: 500; }
.merge-tag__clear { padding: 0 4rpx; color: var(--ink-secondary); font-size: 28rpx; }
.tags { display: flex; flex-wrap: wrap; gap: 8rpx; padding: 8rpx 0; }
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  font-size: 24rpx;
  background: var(--paper-aged);
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
}
.tag-chip__x { color: var(--ink-secondary); padding: 0 4rpx; }
.tag-input {
  flex: 1;
  min-width: 200rpx;
  font-size: 24rpx;
  padding: 4rpx 8rpx;
}
.photos { margin-top: 24rpx; display: flex; flex-direction: column; gap: 12rpx; }
.photos__header { display: flex; justify-content: space-between; align-items: center; }
.photos__count { font-size: 22rpx; color: var(--ink-secondary); }
.photos__pick {
  font-size: 24rpx;
  color: var(--ink-primary);
  padding: 8rpx 18rpx;
  border: 1px solid var(--paper-aged);
  border-radius: 999rpx;
}
.photos__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12rpx; }
.tile { position: relative; width: 100%; aspect-ratio: 1; border-radius: 8rpx; overflow: hidden; }
.tile__img { width: 100%; height: 100%; }
.tile__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.45);
  color: #fff;
  font-size: 28rpx;
  opacity: 0;
}
.tile__overlay.uploading,
.tile__overlay.uploaded,
.tile__overlay.failed { opacity: 1; }
.tile__overlay.failed { background: rgba(180,40,40,.6); }
.tile__x {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  background: rgba(0,0,0,.6);
  color: #fff;
  font-size: 24rpx;
  line-height: 32rpx;
  text-align: center;
}
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 24rpx 32rpx 48rpx; background: var(--paper-cream); border-top: 1px solid var(--paper-aged); }
.submit {
  width: 100%;
  background: var(--ink-primary);
  color: var(--paper-cream);
  border-radius: 999rpx;
  font-size: 30rpx;
  padding: 22rpx 0;
}
.submit--disabled { background: var(--paper-aged); color: var(--ink-secondary); }
```

- [ ] **Step 5: Create `pkgUpload/new-collection/index.ts` (SHELL only — Tasks 8 and 9 add merge-detect and submit)**

```typescript
import type { LocalPhoto } from '../../lib/localPhoto.js';
import { hydrateLocalPhoto } from '../../lib/localPhoto.js';

interface ByTitleMatchLite {
  id: string;
  title: string;
}

function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

Page({
  data: {
    title: '',
    occurredOn: todayYYYYMMDD(),
    location: '',
    description: '',
    tagInput: '',
    tags: [] as string[],
    photos: [] as LocalPhoto[],
    titleMatches: [] as ByTitleMatchLite[],
    mergeTargetId: '',
    mergeTargetTitle: '',
    submitting: false,
    submitLabel: '上传中…',
    canSubmit: false,
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.setData({ title: e.detail.value });
    this.recomputeCanSubmit();
    // Task 8 will wire up merge detection here.
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ occurredOn: String(e.detail.value) });
  },

  onLocationInput(e: WechatMiniprogram.Input) {
    this.setData({ location: e.detail.value });
  },

  onDescriptionInput(e: WechatMiniprogram.Input) {
    this.setData({ description: e.detail.value });
  },

  onTagInput(e: WechatMiniprogram.Input) {
    this.setData({ tagInput: e.detail.value });
  },

  onTagConfirm() {
    const v = this.data.tagInput.trim();
    if (!v) return;
    if (this.data.tags.includes(v)) {
      this.setData({ tagInput: '' });
      return;
    }
    this.setData({ tags: [...this.data.tags, v], tagInput: '' });
  },

  onTagRemove(e: WechatMiniprogram.TouchEvent) {
    const t = e.currentTarget.dataset.tag as string;
    this.setData({ tags: this.data.tags.filter((x) => x !== t) });
  },

  async onPickPhotos() {
    const remaining = 50 - this.data.photos.length;
    if (remaining <= 0) {
      wx.showToast({ title: '已达 50 张上限', icon: 'none' });
      return;
    }
    try {
      const res = await new Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult>((resolve, reject) => {
        wx.chooseMedia({
          count: Math.min(remaining, 9),
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          // Plan 05 spec: read EXIF off ORIGINAL — strict.
          sizeType: ['original'],
          success: resolve,
          fail: reject,
        });
      });
      const paths = res.tempFiles.map((f) => f.tempFilePath);
      wx.showLoading({ title: '处理中…', mask: true });
      const hydrated: LocalPhoto[] = [];
      for (const p of paths) {
        try {
          hydrated.push(await hydrateLocalPhoto(p));
        } catch {
          // skip individual failures — surface a toast in Task 9 retry path
        }
      }
      wx.hideLoading();
      this.setData({ photos: [...this.data.photos, ...hydrated] });
      this.maybeDefaultDate();
      this.recomputeCanSubmit();
    } catch {
      // user-cancelled chooseMedia → silently ignore
    }
  },

  onRemovePhoto(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    this.setData({ photos: this.data.photos.filter((p) => p.tempFilePath !== key) });
    this.recomputeCanSubmit();
  },

  /**
   * If the user hasn't manually picked a date AND the first added photo
   * carries an EXIF takenAt, snap occurredOn to it. The check is "user
   * never touched the date picker" via a sentinel: occurredOn === today.
   */
  maybeDefaultDate() {
    if (this.data.occurredOn !== todayYYYYMMDD()) return;
    const first = this.data.photos[0];
    if (!first?.takenAt) return;
    this.setData({ occurredOn: first.takenAt.slice(0, 10) });
  },

  recomputeCanSubmit() {
    const ok = this.data.title.trim().length > 0 && this.data.photos.length > 0;
    if (ok !== this.data.canSubmit) this.setData({ canSubmit: ok });
  },

  onShowMatches() {
    // Task 8 will fill this in.
  },

  onClearMerge() {
    this.setData({ mergeTargetId: '', mergeTargetTitle: '' });
  },

  async onSubmit() {
    // Task 9 will fill this in.
  },
});
```

- [ ] **Step 6: Verify**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Expected: clean / **94 passing**.

- [ ] **Step 7: Commit**

```bash
git add apps/miniapp/miniprogram/pkgUpload \
       apps/miniapp/miniprogram/pages/timeline/index.wxml \
       apps/miniapp/miniprogram/pages/timeline/index.wxss \
       apps/miniapp/miniprogram/pages/timeline/index.ts
git commit -m "feat(miniapp): new-collection page shell + timeline compose FAB"
```

---

## Task 8: Merge-into-existing detection on title input

**Files:**
- Modify: `apps/miniapp/miniprogram/pkgUpload/new-collection/index.ts`

When the user types in the title field (debounced 300 ms via the existing `lib/debounce.ts` helper), call `collectionsService.findByTitle(title)` and store the matches. The page already has a `titleMatches` slot; surface a small "发现相似集合 · 点击合并" hint when any matches exist. Tapping it opens an action sheet with the candidate list; choosing one sets `mergeTargetId` + `mergeTargetTitle`. Clearing it returns the page to "new collection" mode.

`titleMatches` carries only `{ id, title }` — full DTO is overkill in the data plane. We strip during the service call.

- [ ] **Step 1: Wire the debounced query**

Open `pkgUpload/new-collection/index.ts`. Replace the existing top section (imports + page-local module state + `onTitleInput`) with:

```typescript
import type { LocalPhoto } from '../../lib/localPhoto.js';
import { hydrateLocalPhoto } from '../../lib/localPhoto.js';
import { collectionsService } from '../../lib/services/collections.js';
import { debounce, type DebouncedFn } from '../../lib/debounce.js';

interface ByTitleMatchLite {
  id: string;
  title: string;
}

function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Module-scoped so it survives setData round-trips without expanding Page() shape.
let titleDebounce: DebouncedFn<[string]> | null = null;
```

And replace `onTitleInput` with the wired version:

```typescript
  onLoad() {
    titleDebounce = debounce<[string]>((value: string) => {
      void this.lookupMatches(value);
    }, 300);
  },

  onUnload() {
    titleDebounce?.cancel();
    titleDebounce = null;
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.setData({ title: e.detail.value });
    this.recomputeCanSubmit();
    titleDebounce?.run(e.detail.value);
  },

  async lookupMatches(raw: string) {
    const title = raw.trim();
    if (!title) {
      this.setData({ titleMatches: [] });
      return;
    }
    try {
      const res = await collectionsService.findByTitle(title);
      const matches: ByTitleMatchLite[] = res.matches
        .slice(0, 5)
        .map((m) => ({ id: m.collection.id, title: m.collection.title }));
      // Don't clobber a user-chosen merge target if the new matches don't
      // include it any more — clearing must be explicit via onClearMerge.
      this.setData({ titleMatches: matches });
    } catch {
      // Non-fatal — server is best-effort here.
    }
  },
```

And replace the `onShowMatches` stub with the real action-sheet flow:

```typescript
  onShowMatches() {
    if (this.data.titleMatches.length === 0) return;
    const itemList = this.data.titleMatches.map((m) => m.title);
    wx.showActionSheet({
      itemList,
      success: (r) => {
        const picked = this.data.titleMatches[r.tapIndex];
        if (!picked) return;
        this.setData({
          mergeTargetId: picked.id,
          mergeTargetTitle: picked.title,
          // Snap the title into the picked target — feels right when
          // merging, also pre-populates the value for the user.
          title: picked.title,
        });
        this.recomputeCanSubmit();
      },
    });
  },
```

(The existing `onClearMerge` stub stays exactly as written in Task 7.)

- [ ] **Step 2: Verify**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Expected: clean / **94 passing**.

- [ ] **Step 3: Commit**

```bash
git add apps/miniapp/miniprogram/pkgUpload/new-collection/index.ts
git commit -m "feat(miniapp): debounced /by-title merge detection + action sheet"
```

---

## Task 9: Submit orchestration (request tokens → parallel upload → POST)

**Files:**
- Modify: `apps/miniapp/miniprogram/pkgUpload/new-collection/index.ts`

Replace the `onSubmit` stub with the full orchestration:

1. Validate inputs (title non-empty, ≥1 photo).
2. Request upload tokens — `count = photos.length`, `ext = 'jpg'` (Qiniu's `returnBody` strips ext anyway; we always send `'jpg'`), `collectionDraftId` if merging.
3. Map each photo to its bundle (positional order).
4. `pool(items, 10, async (item, i) => upload one + on-progress setData)`.
5. After all upload, assemble `PhotoInput[]` with fileKey + width + height + caption + takenAt + tags.
6. Call `collectionsService.create({...})` or `collectionsService.appendPhotos(mergeTargetId, { photos, extraTags: tags })`.
7. `wx.showToast({ title: '已创建' / '已合并' })`, navigate back.

- [ ] **Step 1: Add imports at the top of `pkgUpload/new-collection/index.ts`**

Add to the existing import block:

```typescript
import { pool } from '../../lib/pool.js';
import { uploadsService } from '../../lib/services/uploads.js';
import type { CollectionCreateInput, PhotoInput } from '@daynest/shared';
```

- [ ] **Step 2: Replace the `onSubmit` stub with the full orchestrator**

```typescript
  async onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return;
    const titleTrim = this.data.title.trim();
    if (!titleTrim) {
      wx.showToast({ title: '请填写标题', icon: 'none' });
      return;
    }
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '请添加照片', icon: 'none' });
      return;
    }

    this.setData({ submitting: true, submitLabel: '准备中…' });
    try {
      // 1. Get tokens.
      const draftId = this.data.mergeTargetId
        ? `append-${this.data.mergeTargetId}`
        : `draft-${Date.now()}`;
      const tokens = await uploadsService.requestTokens({
        count: this.data.photos.length,
        ext: 'jpg',
        collectionDraftId: draftId,
      });
      if (tokens.length !== this.data.photos.length) {
        throw new Error('token count mismatch');
      }

      // 2. Upload in parallel (concurrency: 10).
      this.setData({ submitLabel: '上传中…' });
      const photosNow = this.data.photos;
      await pool(photosNow, 10, async (photo, i) => {
        const bundle = tokens[i]!;
        this.patchPhoto(photo.tempFilePath, { status: 'uploading', progress: 0 });
        try {
          await uploadsService.uploadToQiniu(bundle, photo.tempFilePath, (pct) => {
            this.patchPhoto(photo.tempFilePath, { progress: pct });
          });
          this.patchPhoto(photo.tempFilePath, {
            status: 'uploaded',
            progress: 100,
            fileKey: bundle.key,
          });
        } catch (e) {
          this.patchPhoto(photo.tempFilePath, {
            status: 'failed',
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      });

      // 3. Assemble PhotoInputs + submit.
      this.setData({ submitLabel: '保存中…' });
      const photos: PhotoInput[] = this.data.photos.map((p) => ({
        fileKey: p.fileKey!,
        width: p.width,
        height: p.height,
        caption: p.caption,
        takenAt: p.takenAt
          ? // EXIF lacked TZ; treat as UTC for storage consistency with web
            new Date(p.takenAt + 'Z').toISOString()
          : null,
        tags: p.tags,
      }));

      if (this.data.mergeTargetId) {
        await collectionsService.appendPhotos(this.data.mergeTargetId, {
          photos,
          extraTags: this.data.tags,
        });
        wx.showToast({ title: '已合并到现有集合', icon: 'success' });
      } else {
        const input: CollectionCreateInput = {
          title: titleTrim,
          description: this.data.description.trim() || null,
          occurredOn: this.data.occurredOn,
          occurredUntil: null,
          location: this.data.location.trim() || null,
          tags: this.data.tags,
          photos,
        };
        await collectionsService.create(input);
        wx.showToast({ title: '已创建', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 700);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '提交失败';
      wx.showToast({ title: msg.length > 14 ? '提交失败' : msg, icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  /** Update one photo in `data.photos` by tempFilePath, preserving order. */
  patchPhoto(key: string, patch: Partial<LocalPhoto>) {
    const photos = this.data.photos.map((p) =>
      p.tempFilePath === key ? { ...p, ...patch } : p,
    );
    this.setData({ photos });
  },
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Expected: clean / **94 passing**.

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/pkgUpload/new-collection/index.ts
git commit -m "feat(miniapp): submit orchestration (tokens + pool upload + create/append)"
```

---

## Task 10: `meService.updateDisplayName` + tests

**Files:**
- Create: `apps/miniapp/miniprogram/lib/services/me.ts`
- Create: `apps/miniapp/tests/lib/services/me.test.ts`

Tiny service wrapping `PATCH /api/auth/me`.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/services/me.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { meService } from '../../../miniprogram/lib/services/me.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('meService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('updateDisplayName hits PATCH /api/auth/me with { displayName }', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          username: 'mom',
          displayName: 'New Name',
          hasWechatBound: false,
        },
      },
    });
    const res = await meService.updateDisplayName('New Name');
    expect(res.displayName).toBe('New Name');
    const req = mock.requests[0];
    expect(req?.method).toBe('PATCH');
    expect(req?.url).toMatch(/\/api\/auth\/me$/);
    expect(req?.data).toEqual({ displayName: 'New Name' });
  });

  it('throws on non-2xx with code in message', async () => {
    mock.queueResponse({
      statusCode: 400,
      data: { error: { code: 'VALIDATION_ERROR' } },
    });
    await expect(meService.updateDisplayName('   ')).rejects.toThrow(/VALIDATION_ERROR/);
  });
});
```

- [ ] **Step 2: Run — must fail.**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/services/me.ts`**

```typescript
import type { UserDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { endpoints } from '../endpoints.js';
import { ensureOk } from './_http.js';

export const meService = {
  async updateDisplayName(displayName: string): Promise<UserDTO> {
    const url = endpoints.me();
    const res = await apiClient.request<{ user: UserDTO }>({
      url,
      method: 'PATCH',
      data: { displayName },
    });
    ensureOk('PATCH', url, res.statusCode, res.data);
    return res.data.user;
  },
};
```

- [ ] **Step 4: Run — must pass** (94 + 2 = **96**).

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/services/me.ts apps/miniapp/tests/lib/services/me.test.ts
git commit -m "feat(miniapp): meService.updateDisplayName (PATCH /api/auth/me)"
```

---

## Task 11: Settings/profile page rebuild

**Files:**
- Modify: `apps/miniapp/miniprogram/pages/me/index.{ts,wxml,wxss,json}`

Replace the stub with a real settings page:
- Avatar chip (first grapheme of `displayName`)
- Login name (read-only username)
- Display name (editable inline via a modal `wx.showModal` or input)
- WeChat bind status (text only; bind/unbind flows are out of scope for Plan 05 — they were deferred from earlier user decisions and remain Plan 06 if needed)
- Invite entry (button — wiring lands in Task 13)
- Logout button

The display-name editor uses `wx.showModal({ editable: true })` which is a built-in modal with a text input. Confirms call `meService.updateDisplayName` and persist via `authStore.setUser`.

- [ ] **Step 1: Update `index.json`**

```json
{
  "navigationBarTitleText": "我的",
  "usingComponents": {}
}
```

- [ ] **Step 2: Update `index.wxml`**

```html
<view class="page">
  <view class="card">
    <view class="avatar">{{initial}}</view>
    <view class="who">
      <view class="who__display">{{user.displayName}}</view>
      <view class="who__login">@{{user.username}}</view>
    </view>
  </view>

  <view class="section">
    <view class="row" bindtap="onEditDisplayName">
      <text class="row__label">展示名</text>
      <view class="row__value">
        <text>{{user.displayName}}</text>
        <text class="row__chev">›</text>
      </view>
    </view>
    <view class="row">
      <text class="row__label">登录名</text>
      <view class="row__value row__value--mute">
        <text>{{user.username}}</text>
      </view>
    </view>
    <view class="row">
      <text class="row__label">微信</text>
      <view class="row__value row__value--mute">
        <text>{{user.hasWechatBound ? '已绑定' : '未绑定'}}</text>
      </view>
    </view>
  </view>

  <view class="section">
    <view class="row" bindtap="onInviteTap">
      <text class="row__label">邀请家人</text>
      <view class="row__value"><text class="row__chev">›</text></view>
    </view>
  </view>

  <button class="logout" bindtap="onLogout">退出登录</button>
</view>
```

- [ ] **Step 3: Update `index.wxss`**

```css
.page { background: var(--paper-cream); min-height: 100vh; padding: 32rpx 24rpx 200rpx; display: flex; flex-direction: column; gap: 28rpx; }
.card {
  display: flex;
  gap: 24rpx;
  align-items: center;
  background: #FFFCF5;
  border-radius: 14rpx;
  padding: 28rpx;
  box-shadow: var(--shadow-polaroid);
}
.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: var(--ink-primary);
  color: var(--paper-cream);
  text-align: center;
  line-height: 96rpx;
  font-size: 44rpx;
}
.who { display: flex; flex-direction: column; gap: 4rpx; }
.who__display { font-size: 36rpx; color: var(--ink-primary); }
.who__login { font-size: 22rpx; color: var(--ink-secondary); }
.section { background: #FFFCF5; border-radius: 14rpx; overflow: hidden; box-shadow: var(--shadow-polaroid); }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 28rpx;
  font-size: 28rpx;
  border-bottom: 1px solid var(--paper-aged);
}
.row:last-child { border-bottom: none; }
.row__label { color: var(--ink-primary); }
.row__value { display: flex; gap: 8rpx; color: var(--ink-primary); }
.row__value--mute { color: var(--ink-secondary); }
.row__chev { color: var(--ink-secondary); font-size: 32rpx; }
.logout {
  margin-top: 16rpx;
  background: transparent;
  color: #b54040;
  border: 1px solid var(--paper-aged);
  border-radius: 999rpx;
  font-size: 28rpx;
  padding: 18rpx 0;
}
```

- [ ] **Step 4: Update `index.ts`**

```typescript
import type { UserDTO } from '@daynest/shared';
import { authStore } from '../../stores/authStore.js';
import { meService } from '../../lib/services/me.js';

function firstGrapheme(s: string): string {
  if (!s) return '?';
  if (typeof Intl !== 'undefined' && (Intl as { Segmenter?: unknown }).Segmenter) {
    type SegLike = { segment: string };
    const Segmenter = (Intl as unknown as {
      Segmenter: new (locale: string, opts: { granularity: 'grapheme' }) => {
        segment: (s: string) => Iterable<SegLike>;
      };
    }).Segmenter;
    const seg = new Segmenter('en', { granularity: 'grapheme' });
    for (const part of seg.segment(s)) return part.segment;
  }
  return Array.from(s)[0] ?? '?';
}

Page({
  data: {
    user: null as UserDTO | null,
    initial: '?',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 });
    }
    const user = authStore.getState().user;
    this.setData({
      user,
      initial: user ? firstGrapheme(user.displayName) : '?',
    });
  },

  onEditDisplayName() {
    const current = this.data.user?.displayName ?? '';
    wx.showModal({
      title: '修改展示名',
      editable: true,
      placeholderText: '一个家人之间的称呼',
      content: current,
      success: (r) => {
        if (!r.confirm) return;
        const next = (r.content ?? '').trim();
        if (!next) {
          wx.showToast({ title: '不能为空', icon: 'none' });
          return;
        }
        if (next === current) return;
        void this.commitDisplayName(next);
      },
    });
  },

  async commitDisplayName(next: string) {
    try {
      const user = await meService.updateDisplayName(next);
      authStore.setUser(user);
      this.setData({ user, initial: firstGrapheme(user.displayName) });
      wx.showToast({ title: '已更新', icon: 'success' });
    } catch {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onInviteTap() {
    // Task 13 wires this.
    wx.showToast({ title: '邀请功能即将上线', icon: 'none' });
  },

  onLogout() {
    authStore.logout();
    wx.reLaunch({ url: '/pages/login/index' });
  },
});
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Expected: clean / **96 passing**.

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/pages/me
git commit -m "feat(miniapp): settings page (avatar + inline display-name edit + wechat status)"
```

---

## Task 12: `invitesService.create` + tests

**Files:**
- Create: `apps/miniapp/miniprogram/lib/services/invites.ts`
- Create: `apps/miniapp/tests/lib/services/invites.test.ts`

POST `/api/invites` returning `{ token, expiresAt }`.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/services/invites.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { invitesService } from '../../../miniprogram/lib/services/invites.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('invitesService.create', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('hits POST /api/invites and returns the token + expiresAt', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { token: 'invite-abc', expiresAt: '2026-06-01T00:00:00.000Z' },
    });
    const out = await invitesService.create();
    expect(out.token).toBe('invite-abc');
    expect(out.expiresAt).toBe('2026-06-01T00:00:00.000Z');
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/invites$/);
  });

  it('throws on non-2xx', async () => {
    mock.queueResponse({ statusCode: 500, data: { error: { code: 'INTERNAL' } } });
    await expect(invitesService.create()).rejects.toThrow(/INTERNAL/);
  });
});
```

- [ ] **Step 2: Run — must fail.**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/services/invites.ts`**

```typescript
import { apiClient } from './_client.js';
import { endpoints } from '../endpoints.js';
import { ensureOk } from './_http.js';

export interface InviteResponse {
  token: string;
  expiresAt: string;
}

export const invitesService = {
  async create(): Promise<InviteResponse> {
    const url = endpoints.invites();
    const res = await apiClient.request<InviteResponse>({
      url,
      method: 'POST',
      data: {},
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data;
  },
};
```

- [ ] **Step 4: Run — must pass** (96 + 2 = **98**).

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/miniprogram/lib/services/invites.ts apps/miniapp/tests/lib/services/invites.test.ts
git commit -m "feat(miniapp): invitesService.create (POST /api/invites)"
```

---

## Task 13: Invite entry on settings page

**Files:**
- Modify: `apps/miniapp/miniprogram/pages/me/index.ts`

Replace the `onInviteTap` stub with a real handler:
1. Call `invitesService.create()`.
2. Show a modal with the invite token and a "复制" button.
3. Tapping copy calls `wx.setClipboardData({ data: token })` and toasts.

For v1 we don't generate a deep-link URL inside the modal — invitees enter the token manually during register (matching the web's invite-token UX). Plan 06 may layer in `onShareAppMessage` for in-WeChat sharing.

- [ ] **Step 1: Add the import**

At the top of `apps/miniapp/miniprogram/pages/me/index.ts`:

```typescript
import { invitesService } from '../../lib/services/invites.js';
```

- [ ] **Step 2: Replace `onInviteTap`**

```typescript
  async onInviteTap() {
    wx.showLoading({ title: '生成中…', mask: true });
    try {
      const inv = await invitesService.create();
      wx.hideLoading();
      const expires = new Date(inv.expiresAt);
      const expiresLabel = `${expires.getMonth() + 1}月${expires.getDate()}日 ${String(expires.getHours()).padStart(2, '0')}:${String(expires.getMinutes()).padStart(2, '0')}`;
      wx.showModal({
        title: '邀请家人',
        content: `邀请码：${inv.token}\n有效期至 ${expiresLabel}`,
        confirmText: '复制邀请码',
        cancelText: '关闭',
        success: (r) => {
          if (!r.confirm) return;
          wx.setClipboardData({
            data: inv.token,
            success: () => wx.showToast({ title: '已复制', icon: 'success' }),
          });
        },
      });
    } catch {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/miniapp test
```

Expected: clean / **98 passing**.

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/miniprogram/pages/me/index.ts
git commit -m "feat(miniapp): invite modal on settings (copy-token to clipboard)"
```

---

## Task 14: Subscribe-message at favorite-time

**Files:**
- Create: `apps/miniapp/miniprogram/lib/subscribe.ts`
- Create: `apps/miniapp/tests/lib/subscribe.test.ts`
- Modify: `apps/miniapp/miniprogram/pkgCollection/detail/index.ts` — call `maybePromptForFavorite` when favoriting ON
- Modify: `apps/miniapp/miniprogram/pkgCollection/viewer/index.ts` — same wiring

`wx.requestSubscribeMessage` is the mini-program "one-time subscription" prompt. It must be called **synchronously** in a user-tap handler (WX rejects programmatic calls). We invoke it from inside the favorite-toggle handlers BEFORE awaiting the api. On user-accept, we then fire-and-forget POST `/api/wechat/subscribe`.

The helper guards against re-prompting too aggressively by remembering, in `wx.storage`, when we last prompted for each template. Spec said "fire-and-forget"; we keep the helper extra-defensive so a transient api error doesn't poison the storage flag.

- [ ] **Step 1: Write the failing test**

`apps/miniapp/tests/lib/subscribe.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { maybePromptForFavorite, SUBSCRIBE_LAST_PROMPT_KEY } from '../../miniprogram/lib/subscribe.js';
import { WECHAT_TEMPLATES } from '@daynest/shared';
import { authStore } from '../../miniprogram/stores/authStore.js';

describe('maybePromptForFavorite', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('calls wx.requestSubscribeMessage with the NEW_PHOTO template id', async () => {
    let captured: string[] | undefined;
    (globalThis as Record<string, unknown>).wx = {
      ...(globalThis as Record<string, unknown>).wx as object,
      requestSubscribeMessage: (o: {
        tmplIds: string[];
        success: (r: Record<string, string>) => void;
        fail: (e: unknown) => void;
      }) => {
        captured = o.tmplIds;
        Promise.resolve().then(() => o.success({}));
      },
    };
    await maybePromptForFavorite();
    expect(captured).toEqual([WECHAT_TEMPLATES.NEW_PHOTO]);
  });

  it('POSTs accepted templates to /api/wechat/subscribe (fire-and-forget)', async () => {
    (globalThis as Record<string, unknown>).wx = {
      ...(globalThis as Record<string, unknown>).wx as object,
      requestSubscribeMessage: (o: {
        tmplIds: string[];
        success: (r: Record<string, string>) => void;
      }) => {
        const result: Record<string, string> = {};
        for (const id of o.tmplIds) result[id] = 'accept';
        Promise.resolve().then(() => o.success(result));
      },
    };
    mock.queueResponse({ statusCode: 200, data: { ok: true, recorded: 1 } });
    await maybePromptForFavorite();
    // Wait a tick for the fire-and-forget POST to land.
    await new Promise((r) => setTimeout(r, 10));
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/wechat\/subscribe$/);
    expect(req?.data).toEqual({ accepted: [WECHAT_TEMPLATES.NEW_PHOTO] });
  });

  it('does not POST when the user rejects', async () => {
    (globalThis as Record<string, unknown>).wx = {
      ...(globalThis as Record<string, unknown>).wx as object,
      requestSubscribeMessage: (o: {
        tmplIds: string[];
        success: (r: Record<string, string>) => void;
      }) => {
        Promise.resolve().then(() => o.success({ [o.tmplIds[0]!]: 'reject' }));
      },
    };
    mock.queueResponse({ statusCode: 200, data: { ok: true, recorded: 0 } });
    await maybePromptForFavorite();
    await new Promise((r) => setTimeout(r, 10));
    expect(mock.requests.length).toBe(0);
  });

  it('skips the prompt when the cooldown is active', async () => {
    let promptCalls = 0;
    (globalThis as Record<string, unknown>).wx = {
      ...(globalThis as Record<string, unknown>).wx as object,
      requestSubscribeMessage: () => {
        promptCalls += 1;
      },
    };
    // Pretend we prompted 60 seconds ago.
    mock.storage.set(SUBSCRIBE_LAST_PROMPT_KEY, Date.now() - 60_000);
    await maybePromptForFavorite();
    expect(promptCalls).toBe(0);
  });
});
```

- [ ] **Step 2: Run — must fail.**

- [ ] **Step 3: Create `apps/miniapp/miniprogram/lib/subscribe.ts`**

```typescript
import { WECHAT_TEMPLATES } from '@daynest/shared';
import { apiClient } from './services/_client.js';
import { endpoints } from './endpoints.js';
import { storage } from './storage.js';

export const SUBSCRIBE_LAST_PROMPT_KEY = 'daynest.subscribe.lastPrompt';

// Cooldown so a user that just dismissed isn't re-prompted on every tap.
// 7 days mirrors WX's recommended "one-time" cadence.
const COOLDOWN_MS = 7 * 24 * 3600_000;

interface SubscribeResult {
  [templateId: string]: 'accept' | 'reject' | 'ban' | string;
}

/**
 * Call from a user-tap handler when the user toggles a favorite ON. Pure
 * fire-and-forget — never throws, never blocks the calling flow.
 */
export async function maybePromptForFavorite(): Promise<void> {
  // Respect the recent-prompt cooldown.
  const last = storage.get<number>(SUBSCRIBE_LAST_PROMPT_KEY);
  if (last && Date.now() - last < COOLDOWN_MS) return;

  const tmplIds = [WECHAT_TEMPLATES.NEW_PHOTO];
  storage.set(SUBSCRIBE_LAST_PROMPT_KEY, Date.now());

  let result: SubscribeResult | null = null;
  try {
    result = await new Promise<SubscribeResult>((resolve, reject) => {
      wx.requestSubscribeMessage({
        tmplIds,
        success: (r) => resolve(r as SubscribeResult),
        fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
      });
    });
  } catch {
    return;
  }
  if (!result) return;

  const accepted = tmplIds.filter((id) => result![id] === 'accept');
  if (accepted.length === 0) return;

  // Fire-and-forget POST. Swallow all errors — the subscribe attempt is
  // opportunistic and the api can recover from a missed quota row.
  void apiClient
    .request({
      url: endpoints.subscribe(),
      method: 'POST',
      data: { accepted },
    })
    .catch(() => undefined);
}
```

- [ ] **Step 4: Wire into the favorite handlers**

In `apps/miniapp/miniprogram/pkgCollection/detail/index.ts`, add at the top:

```typescript
import { maybePromptForFavorite } from '../../lib/subscribe.js';
```

Then inside `onFavoriteToggle`, immediately after computing `wasFav` and before the optimistic `setData`:

```typescript
    if (!wasFav) {
      // Fire-and-forget — must be called synchronously in the user-tap.
      void maybePromptForFavorite();
    }
```

In `apps/miniapp/miniprogram/pkgCollection/viewer/index.ts`, add at the top:

```typescript
import { maybePromptForFavorite } from '../../lib/subscribe.js';
```

Then inside `onFavoriteTap`, immediately after `const wasFav = photo.favoritedByMe;` and before the optimistic `setData`:

```typescript
    if (!wasFav) {
      void maybePromptForFavorite();
    }
```

- [ ] **Step 5: Run — must pass** (98 + 4 = **102**).

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp/miniprogram/lib/subscribe.ts \
       apps/miniapp/tests/lib/subscribe.test.ts \
       apps/miniapp/miniprogram/pkgCollection/detail/index.ts \
       apps/miniapp/miniprogram/pkgCollection/viewer/index.ts
git commit -m "feat(miniapp): subscribe-message prompt on favorite-on (with 7-day cooldown)"
```

---

## Task 15: End-to-end smoke test (upload + create collection)

**Files:**
- Modify: `apps/api/tsconfig.json` (extend `exclude`)
- Create: `apps/api/tests/wechat/miniapp-upload.test.ts`

Cross-package E2E test mirroring the Plan 03/04 pattern. Exercises:
1. `uploadsService.requestTokens` returns the right count and key format.
2. `collectionsService.findByTitle` returns matches with `score`/`matchType`.
3. `collectionsService.create` accepts `CollectionCreateInput` and returns the new detail DTO.
4. `collectionsService.appendPhotos` appends to an existing collection.
5. `meService.updateDisplayName` and `invitesService.create` (short sanity checks).

The qiniu-upload step itself isn't tested here — `uploadsService.uploadToQiniu` is covered in Task 5's unit tests, and the integration path through Fastify only touches `/api/uploads/token` which returns fake bundles via `FakeStorage`.

- [ ] **Step 1: Extend `apps/api/tsconfig.json#exclude`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src", "scripts", "tests"],
  "exclude": [
    "tests/wechat/miniapp-integration.test.ts",
    "tests/wechat/miniapp-browse.test.ts",
    "tests/wechat/miniapp-tags.test.ts",
    "tests/wechat/miniapp-upload.test.ts"
  ]
}
```

- [ ] **Step 2: Create the smoke test**

`apps/api/tests/wechat/miniapp-upload.test.ts`:

```typescript
// Cross-package integration test that imports miniapp source. Excluded from
// the api's tsc build via tsconfig.json#exclude (vitest still runs it via
// esbuild). See sibling miniapp-browse.test.ts for the rationale.

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
import { meService } from '../../../miniapp/miniprogram/lib/services/me.js';
import { invitesService } from '../../../miniapp/miniprogram/lib/services/invites.js';

describe('miniapp write-side — end-to-end via real Fastify', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    mock = installWxMock();
    ctx = await buildApp();
    authStore.reset();

    const user = await ctx.prisma.user.create({
      data: {
        username: 'writer',
        displayName: 'Writer',
        passwordHash: await hashPassword('writerpw123'),
      },
    });
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

  it('uploadsService.requestTokens returns N bundles for the given count', async () => {
    const tokens = await uploadsService.requestTokens({ count: 3, ext: 'jpg', collectionDraftId: 'd1' });
    expect(tokens.length).toBe(3);
    expect(tokens[0]?.key).toMatch(/^photos\/d1\//);
    // FakeStorage's uploadUrl is the fake host.
    expect(tokens[0]?.uploadUrl).toBe('https://fake-upload.daynest.test');
  });

  it('collectionsService.create + findByTitle: roundtrip', async () => {
    const tokens = await uploadsService.requestTokens({ count: 2, ext: 'jpg' });
    const created = await collectionsService.create({
      title: 'Spring trip',
      description: null,
      occurredOn: '2026-04-12',
      occurredUntil: null,
      location: null,
      tags: ['travel'],
      photos: tokens.map((t, i) => ({
        fileKey: t.key,
        width: 1000,
        height: 750,
        caption: null,
        takenAt: null,
        tags: [],
      })),
    });
    expect(created.title).toBe('Spring trip');
    expect(created.photos.length).toBe(2);

    const lookup = await collectionsService.findByTitle('Spring');
    expect(lookup.matches.length).toBeGreaterThanOrEqual(1);
    const hit = lookup.matches.find((m) => m.collection.id === created.id);
    expect(hit).toBeTruthy();
  });

  it('collectionsService.appendPhotos extends an existing collection', async () => {
    const initial = await uploadsService.requestTokens({ count: 1, ext: 'jpg' });
    const collection = await collectionsService.create({
      title: 'append-test',
      description: null,
      occurredOn: '2026-04-12',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [{
        fileKey: initial[0]!.key,
        width: 1000,
        height: 750,
        caption: null,
        takenAt: null,
        tags: [],
      }],
    });
    expect(collection.photos.length).toBe(1);

    const extra = await uploadsService.requestTokens({ count: 2, ext: 'jpg', collectionDraftId: `append-${collection.id}` });
    const updated = await collectionsService.appendPhotos(collection.id, {
      photos: extra.map((t) => ({
        fileKey: t.key,
        width: 1000,
        height: 750,
        caption: null,
        takenAt: null,
        tags: [],
      })),
      extraTags: ['family'],
    });
    expect(updated.photos.length).toBe(3);
  });

  it('meService.updateDisplayName updates the user row', async () => {
    const u = await meService.updateDisplayName('Writer-Renamed');
    expect(u.displayName).toBe('Writer-Renamed');
  });

  it('invitesService.create returns a token + expiresAt', async () => {
    const inv = await invitesService.create();
    expect(typeof inv.token).toBe('string');
    expect(inv.token.length).toBeGreaterThan(0);
    expect(typeof inv.expiresAt).toBe('string');
  });
});
```

- [ ] **Step 3: Run the focused test**

```bash
cd /Users/bytedance/work/ai/day_nest
pnpm --filter @daynest/api test -- miniapp-upload
```

Expected: 5 tests pass.

- [ ] **Step 4: Full api + miniapp + shared suites**

```bash
pnpm --filter @daynest/api test       # 167 + 5 = 172
pnpm --filter @daynest/miniapp test   # 102 (unchanged)
pnpm --filter @daynest/shared test    # 22 (unchanged)
```

- [ ] **Step 5: Builds**

```bash
pnpm --filter @daynest/miniapp build
pnpm --filter @daynest/api build
pnpm --filter @daynest/shared build
```

All clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/tests/wechat/miniapp-upload.test.ts apps/api/tsconfig.json
git commit -m "test(miniapp): end-to-end smoke test for upload + create + append + me + invite"
```

---

## Post-plan verification (manual)

After all 15 commits, smoke-test in WeChat DevTools:

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
   - Timeline tab → see the floating `＋` button → tap → new-collection page opens.
   - Title input → type a few characters → if any existing collection matches, the "发现相似集合" hint appears → tap → action sheet → choose one → page swaps into "合并到 ..." mode.
   - Picking photos: tap "＋ 添加照片" → choose 3 images → grid shows thumbnails with `pending` state. If any image has EXIF DateTimeOriginal, the date picker should snap to that date.
   - Submit: tap "创建集合" → tile overlays cycle pending → uploading (%) → uploaded (✓) → toast 已创建 → navigate back to timeline → new collection visible at top (after pull-to-refresh).
   - Favorite a photo (detail or viewer) → WX subscribe-message system prompt appears the first time → accept → server quota increments via POST `/api/wechat/subscribe`. Toggling again within 7 days should NOT re-prompt.
   - Me tab → see avatar + display name + login name + WeChat status → tap 展示名 → modal opens with current value → edit → 保存 → toast 已更新.
   - Me tab → tap 邀请家人 → modal shows the invite code + 有效期 → tap 复制邀请码 → toast 已复制 → paste somewhere to verify.

---

## Self-Review

**Spec coverage** (against `2026-05-22-miniapp-design.md`):
- §3.2 New collection / Settings / Invite pages ✅
- §3.3 Upload pipeline (EXIF on original, client-side compression, 10 concurrent) ✅
- §4.3 Subscribe-message at favorite-time (fire-and-forget) ✅
- §4.7 Settings page (display name edit) ✅

**Plan 04 boundary check:**
- Plan 04 left `pages/me/index` as a stub. Task 11 replaces it.
- Plan 04 left the favorite handlers without subscribe prompts. Task 14 wires them in.
- All other Plan 04 pages are untouched.

**Placeholder scan:**
- No `TODO` / `later` / `implement appropriate error handling` in any task body.
- Every code block is complete; no `...`.
- All commands have expected output (test counts, commit messages).

**Type consistency:**
- `CollectionCreateInput`, `CollectionAppendInput`, `PhotoInput`, `UserDTO`, `WECHAT_TEMPLATES` all imported from `@daynest/shared`.
- `LocalPhoto` is the only new mini-app-local type for the upload pipeline.

---

## Done criteria

After all 15 commits:
- `pnpm --filter @daynest/miniapp test` passes: **102 tests** (Plan 04's 74 + 28 new)
- `pnpm --filter @daynest/api test` passes: **172 tests** (Plan 04's 167 + 5 new)
- `pnpm --filter @daynest/shared test` passes: **22** (unchanged)
- All three `pnpm --filter ... build` clean
- `apps/miniapp/miniprogram/pkgUpload/new-collection/` exists with the four files
- `apps/miniapp/miniprogram/pages/me/` is a real settings page (not a stub)
- Subscribe prompts fire on favorite-on (with 7-day cooldown)
- Manual DevTools verification (Post-plan section) succeeds against the real Qiniu test bucket

—— end of plan
