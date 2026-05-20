# DayNest Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the family-facing UI: scrapbook visual language, timeline homepage, tag-clustered pinboard view, collection detail / photo viewer, upload flow with direct-to-Qiniu uploads, settings & auth pages. Mobile-first.

**Architecture:** React 18 + Vite SPA. Tailwind for styling, shadcn/ui only where it earns its place (we own most components for the scrapbook look). Framer Motion for animations. TanStack Query for server state, zustand for tiny client state (auth + upload queue). Routes via React Router v6.

**Tech Stack:** Vite, React, TypeScript, Tailwind, Framer Motion, Embla Carousel, TanStack Query, Axios, zustand, browser-image-compression.

---

## Overview of files

```
apps/web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── public/
│   └── fonts/                 # downloaded if needed
└── src/
    ├── main.tsx               # entry
    ├── App.tsx                # router + providers
    ├── styles/
    │   ├── globals.css        # Tailwind directives + scrapbook utilities
    │   └── tokens.ts          # exported design tokens (colors, fonts)
    ├── lib/
    │   ├── api.ts             # axios instance + interceptors
    │   ├── queryClient.ts     # TanStack Query client
    │   ├── auth.ts            # accessToken store (zustand)
    │   ├── upload.ts          # direct-to-qiniu upload helper
    │   ├── exif.ts            # EXIF + image meta extraction
    │   ├── deterministicTilt.ts  # photoId -> angle/position
    │   └── env.ts             # VITE_API_BASE_URL etc
    ├── hooks/
    │   ├── useAuth.ts
    │   ├── useCollections.ts
    │   ├── useCollection.ts
    │   ├── useTags.ts
    │   └── useUpload.ts
    ├── components/
    │   ├── ui/                # shadcn primitives only (Button, Input, Dialog)
    │   ├── scrapbook/
    │   │   ├── Polaroid.tsx
    │   │   ├── TapeBadge.tsx
    │   │   ├── Pin.tsx
    │   │   ├── KraftCard.tsx
    │   │   └── HandwrittenText.tsx
    │   ├── auth/
    │   │   ├── LoginForm.tsx
    │   │   └── RegisterForm.tsx
    │   ├── upload/
    │   │   ├── Dropzone.tsx
    │   │   ├── UploadQueue.tsx
    │   │   └── PhotoMetaForm.tsx
    │   ├── nav/
    │   │   ├── AppHeader.tsx
    │   │   └── UserMenu.tsx
    │   └── tag/
    │       ├── TagStrip.tsx           # 顶部胶带条
    │       └── TagCluster.tsx         # 软木板单个标签簇
    ├── pages/
    │   ├── LoginPage.tsx
    │   ├── RegisterPage.tsx
    │   ├── TimelinePage.tsx           # /
    │   ├── TagsOverviewPage.tsx       # /tags
    │   ├── TagPinboardPage.tsx        # /tags/:name
    │   ├── CollectionDetailPage.tsx   # /c/:id
    │   ├── PhotoViewerPage.tsx        # /c/:id/p/:index
    │   ├── UploadPage.tsx             # /upload
    │   └── SettingsPage.tsx           # /settings
    └── routes.tsx                     # router definition
```

---

## Task 1: Vite + React + Tailwind scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles/globals.css`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@daynest/web",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@daynest/shared": "workspace:*",
    "@tanstack/react-query": "^5.40.0",
    "axios": "^1.7.0",
    "browser-image-compression": "^2.0.2",
    "clsx": "^2.1.1",
    "embla-carousel-react": "^8.1.5",
    "framer-motion": "^11.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "tailwind-merge": "^2.3.0",
    "zod": "^3.23.0",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` + Vite + Tailwind configs** (see implementation step 1 in `apps/web/`)

- [ ] **Step 3: index.html, main.tsx, App.tsx, globals.css**

- [ ] **Step 4: Run `pnpm dev`, open http://localhost:5173, verify Tailwind works**

- [ ] **Step 5: Commit**

---

## Task 2: Design tokens + scrapbook utilities

**Files:**
- Modify: `apps/web/tailwind.config.ts` — add custom colors, fontFamily, boxShadow
- Create: `apps/web/src/styles/tokens.ts` — TS-side tokens
- Modify: `apps/web/src/styles/globals.css` — kraft paper background, polaroid utilities

**Colors / fonts** (from spec §7):
- `paper`: `#f1ece1`
- `ink`: `#2b2418`
- `kraft`: `#a88a5c`
- `pin-red`, `pin-blue`, `pin-yellow`, `pin-green`: `#d23b3b` `#3b6ed2` `#d2b03b` `#3bd271`
- Serif body: `'Source Han Serif SC', 'Songti SC', 'Times New Roman', serif`
- Sans body: `'Inter', system-ui, sans-serif`
- Hand: `'Caveat', 'Permanent Marker', cursive`
- Mono: `'JetBrains Mono', 'Menlo', monospace`

**Utilities to add via `@layer`:**
- `.bg-paper` — paper + noise + radial shadows
- `.polaroid` — white card, padding 8px 8px 28px, shadow, hover lift
- `.tape` — yellow translucent + skew
- `.pin` — circular small dot + shadow

**Verification:**
- [ ] Render a static demo screen at `/` showing Polaroid, TapeBadge, Pin via temporary code; visually inspect at http://localhost:5173

---

## Task 3: scrapbook components

**Files:**
- Create: `apps/web/src/components/scrapbook/Polaroid.tsx`
- Create: `apps/web/src/components/scrapbook/TapeBadge.tsx`
- Create: `apps/web/src/components/scrapbook/Pin.tsx`
- Create: `apps/web/src/components/scrapbook/KraftCard.tsx`
- Create: `apps/web/src/components/scrapbook/HandwrittenText.tsx`
- Create: `apps/web/src/lib/deterministicTilt.ts`

### Polaroid API
```tsx
<Polaroid
  src={thumbnailUrl}
  alt={caption ?? ''}
  caption={caption}
  width={4}        // 4:3 vs 3:4; default 4:3
  height={3}
  tilt={3}         // override; default computed from photoId
  loading="lazy"
/>
```

Implements:
- Random/seeded rotation `tilt ?? deterministicTilt(photoId, ±6)`
- Hover scale to 1.04, rotate to 0
- Captures click for routing (forwarded onClick)

### TapeBadge API
```tsx
<TapeBadge tilt={-2}>樱花</TapeBadge>
```
Yellow translucent, handwritten font, skewed.

### Pin API
```tsx
<Pin color="red" />   // accepts red|blue|yellow|green|custom
```

### KraftCard
Wrapper for sections that should sit on a darker kraft paper, with inner shadow.

### HandwrittenText
`<HandwrittenText>Hello Fuji ♡</HandwrittenText>` — Caveat font, slight rotation.

### deterministicTilt(id: string, range: number): number
- Hash id (e.g. FNV-1a), modulo into [-range, range].

---

## Task 4: API client + auth state + queryClient

- [ ] Create `apps/web/src/lib/api.ts` — axios instance pointing at `import.meta.env.VITE_API_BASE_URL || '/api'`. Interceptors:
  - Inject `Authorization: Bearer <token>` from auth store
  - On 401 with refresh token present → call `/api/auth/refresh`, retry once; on failure clear auth + redirect to /login
- [ ] Create `apps/web/src/lib/queryClient.ts` — exports `queryClient` with sensible defaults
- [ ] Create `apps/web/src/lib/auth.ts` — zustand store: `{ user, accessToken, setAuth, logout }`, persisted to localStorage
- [ ] Create `apps/web/src/lib/env.ts` — typed env access

---

## Task 5: hooks

- [ ] `useAuth` — wraps store + `/api/auth/me` query
- [ ] `useCollections({ tag?, limit? })` — `useInfiniteQuery`
- [ ] `useCollection(id)` — single detail
- [ ] `useTags()` — list of tags with counts
- [ ] `useUpload()` — manages upload queue (zustand)

---

## Task 6: Auth pages

- [ ] `LoginPage` — username + password; on success, set auth store + navigate to `/`
- [ ] `RegisterPage` — reads `?token=` from URL; shows username/displayName/password form; on success, set auth + navigate to `/`
- [ ] Route guard: pages other than `/login` / `/register` redirect to `/login` if no token

**Visual:** kraft paper background, polaroid-style form card, big handwritten title "回到家".

---

## Task 7: App shell + header

- [ ] `AppHeader` — top bar with logo wordmark (handwritten), nav links (时间轴 / 标签 / 上传), user menu with avatar
- [ ] Layout shell wraps all routes

---

## Task 8: Timeline page (`/`)

- [ ] Vertical dashed line down center, kraft color
- [ ] Each collection: alternating left/right card with polaroid + handwritten title + occurred-on date (mono font) + tag chips
- [ ] Framer Motion: items fade + slide in from their side as they enter viewport
- [ ] Click → navigate `/c/:id`; use `layoutId={collectionId}` on cover image for shared-element animation
- [ ] Infinite scroll via TanStack Query

---

## Task 9: Collection detail page (`/c/:id`)

- [ ] Hero: large cover photo (`layoutId={collectionId}`), title in serif large, occurred-on + occurred-until in mono, tags as tape badges, description in serif (markdown rendered)
- [ ] Photos: vertical "polaroid scatter" — flexible grid, each polaroid has its deterministic tilt; stagger animation on enter
- [ ] Click any photo → navigate `/c/:id/p/:index`

---

## Task 10: Photo viewer (`/c/:id/p/:index`)

- [ ] Full-screen overlay, paper-textured backdrop dim
- [ ] Embla Carousel with full-resolution original images (request signed URL via `GET /api/collections/:id` already returns; but we need original — extend endpoint or sign on demand)
  - **Backend gap discovered:** Add `GET /api/collections/:id/photos/:photoId/url` returning a signed download URL for the original (no `imageMogr2`). Add a TODO note to implement this in backend.
- [ ] Keyboard: arrow keys to navigate, Esc to close (back to collection)
- [ ] Mobile: swipe gestures (Embla handles)
- [ ] Caption shown bottom-left in serif
- [ ] Close → back to `/c/:id`

> Note: V1 fallback if backend gap not yet filled — viewer uses the 1600-wide thumbnail (`signThumbnail(key, 1600)`) instead of original. Add to backend backlog.

---

## Task 11: Tags overview (`/tags`)

- [ ] Top: `TagStrip` showing top 8 hot tags as tape badges
- [ ] Main: large kraft-paper canvas containing N "tag clusters"
  - Each cluster: handwritten tag name on a sticky note + 3-5 polaroids around it
  - Layout: cluster positions computed by force-directed-ish hash of tag name (deterministic), placed within scrollable canvas
  - SVG curves connecting overlapping tags
- [ ] Click any polaroid → `/c/:id`; click tag name → `/tags/:name`

---

## Task 12: Tag pinboard (`/tags/:name`)

- [ ] Cork-board background (CSS noise + warm brown)
- [ ] All collections under this tag as polaroids with deterministic positions/angles (hash of `${tag}-${photoId}`)
- [ ] Each has a pin on top
- [ ] Pan with drag (Framer Motion), zoom with wheel/pinch (0.5x–2x)
- [ ] Click polaroid → `/c/:id` with shared-layout animation

---

## Task 13: Upload page (`/upload`)

- [ ] `Dropzone` — desktop: drag-drop; mobile: tap to choose / take photo
- [ ] For each file:
  1. Read EXIF (use `exifr` or implement minimal)
  2. Get image dimensions
  3. (Optional, default ON) compress via `browser-image-compression` to ≤4MB
  4. Add to upload queue
- [ ] Batch: `POST /api/uploads/token` with count
- [ ] Direct upload to Qiniu (PUT or POST formdata) using `uploadUrl + token`
- [ ] Show per-file progress
- [ ] After all uploaded, show metadata form:
  - title (required), description (markdown), occurredOn (date input, default = min taken_at), occurredUntil, location, tags (chip input)
  - per-photo: caption + per-photo tags
- [ ] Submit → `POST /api/collections` with file_keys + metadata
- [ ] On success → navigate to `/c/:id`

---

## Task 14: Settings page

- [ ] Show display name, change avatar (uploads via existing upload flow), change password
- [ ] "Invite a family member" button → `POST /api/invites`; shows a copy-paste registration URL with `?token=...`
- [ ] Logout button

---

## Task 15: Animations polish + `prefers-reduced-motion`

- [ ] Audit all Framer Motion usage; respect `prefers-reduced-motion` (set animations to no-op when true)
- [ ] On mobile (< 768px), reduce stagger durations and disable expensive hover effects (no hover on touch anyway)

---

## Task 16: Visual / manual smoke

- [ ] Run frontend + backend together; create a collection with 5 photos via the UI; verify it appears in timeline; navigate via shared-layout animation; verify pinboard view shows it
- [ ] Test on Chrome DevTools "iPhone 14 Pro" emulator
- [ ] Commit final state
