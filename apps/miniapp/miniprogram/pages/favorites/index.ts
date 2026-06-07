import type { FavoriteEntryDTO } from '@daynest/shared';
import { favoritesService } from '../../lib/services/favorites.js';
import { stableInt } from '../../lib/hash.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';
import { consumeTabSlide } from '../../lib/tabTransition.js';
import { getContentVersion } from '../../lib/contentVersion.js';

/** Pre-rendered "♥ 妈妈 · 2026.05.24" string for the actor list under the
 *  polaroid. We pre-format on the JS side because WXML doesn't have a
 *  functional template engine and we want clean ellipsis if it overflows. */
interface ActorLine {
  userId: string;
  label: string;
}

interface Item {
  id: string;
  photo: FavoriteEntryDTO['photo'];
  collection: FavoriteEntryDTO['collection'];
  /** Pre-formatted YYYY.MM.DD for the small mono date inside the polaroid. */
  displayDate: string;
  /** Precomputed natural-aspect frame style for photo-tile. */
  frameStyle: string;
  /** Explicit card tilt. Alternates by list order for a less uniform first row. */
  tiltDeg: number;
  /** Up to 3 formatted actor lines for display under the polaroid. */
  actors: ActorLine[];
  /** Count of actors NOT shown ("+N more" footer). 0 means hide it. */
  remainingActors: number;
}

function formatDot(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day}`;
}

function formatActor(a: FavoriteEntryDTO['favoritedBy'][number]): string {
  // Surface the person's name front-and-center ("谁喜欢了这张照片"). The photo's
  // own date already shows in the polaroid subtitle, so we drop the per-actor
  // timestamp here to keep the name unambiguous and legible.
  return a.displayName || a.username;
}

function photoFrameStyle(photo: FavoriteEntryDTO['photo']): string {
  if (!photo.width || !photo.height) return '';
  // Clamp to a sensible range so a 9:1 panorama doesn't dwarf the row and a
  // tall portrait doesn't push the next card a full screen down. This value
  // is calculated before rendering to avoid per-tile observer setData churn.
  const raw = (photo.height / photo.width) * 100;
  const clamped = Math.max(50, Math.min(160, raw));
  return `padding-top: ${Number(clamped.toFixed(2))}%`;
}

function favoriteTiltDeg(photoId: string, index: number): number {
  const sign = index % 2 === 0 ? -1 : 1;
  const magnitude = 3 + stableInt(`${photoId}-favorite-mag`, 3); // 3..5deg
  const wobble = stableInt(`${photoId}-favorite-wobble`, 3) - 1; // -1..1deg
  return sign * magnitude + wobble;
}

function toItem(e: FavoriteEntryDTO, index: number): Item {
  const visible = e.favoritedBy.slice(0, 3);
  return {
    id: e.photo.id,
    photo: e.photo,
    collection: e.collection,
    displayDate: formatDot(e.collection.occurredOn),
    frameStyle: photoFrameStyle(e.photo),
    tiltDeg: favoriteTiltDeg(e.photo.id, index),
    actors: visible.map((a) => ({ userId: a.userId, label: formatActor(a) })),
    remainingActors: Math.max(0, e.favoritedBy.length - visible.length),
  };
}

// See pages/timeline — skip the redundant refresh on first mount, re-pull on
// every subsequent return to the tab.
let hasShown = false;
// Guards overlapping loads; gates the cell entrance animation to first load.
let inFlight = false;
let animatedOnce = false;
let slideTimer: ReturnType<typeof setTimeout> | null = null;
// Content version captured on the last successful list load — see pages/timeline.
let lastLoadedVersion = -1;

Page({
  data: {
    theme: '' as '' | 'dark',
    items: [] as Item[],
    leftItems: [] as Item[],
    rightItems: [] as Item[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
    slide: '' as '' | 'slide-in-right' | 'slide-in-left',
    enterAnim: true,
  },

  onShow() {
    applyTheme(this);
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 1 });
    this.playTabSlide();
    if (!hasShown) {
      hasShown = true;
      if (this.data.items.length === 0 && !inFlight) void this.refresh();
    } else if (this.data.items.length === 0 || getContentVersion() !== lastLoadedVersion) {
      // Returning to the tab — only re-pull when content changed (e.g. a photo
      // was favorited/unfavorited in the viewer/detail). Refresh in place (no
      // clear, no re-animation). When unchanged we skip the network call → no
      // thumbnail re-signing → no flicker.
      void this.refresh(true);
    }
  },

  onUnload() {
    disposeTheme(this);
    hasShown = false;
    animatedOnce = false;
    if (slideTimer !== null) {
      clearTimeout(slideTimer);
      slideTimer = null;
    }
  },

  playTabSlide() {
    const slide = consumeTabSlide();
    if (!slide) return;
    if (slideTimer !== null) clearTimeout(slideTimer);
    this.setData({ slide });
    slideTimer = setTimeout(() => {
      slideTimer = null;
      this.setData({ slide: '' });
    }, 280);
  },

  onPullDownRefresh() {
    this.refresh(true).finally(() => wx.stopPullDownRefresh());
  },

  async refresh(inPlace = false) {
    if (inFlight) return;
    inFlight = true;
    if (!inPlace) {
      this.setData({ loading: true, items: [], leftItems: [], rightItems: [], nextCursor: null });
    }
    const enter = !animatedOnce;
    try {
      const res = await favoritesService.list({ limit: 30 });
      animatedOnce = true;
      lastLoadedVersion = getContentVersion();
      this.applyItems(res.items.map((entry, idx) => toItem(entry, idx)), res.nextCursor, enter);
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      inFlight = false;
      if (!inPlace) this.setData({ loading: false });
    }
  },

  async onLoadMore() {
    if (!this.data.nextCursor || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      const res = await favoritesService.list({ limit: 30, cursor: this.data.nextCursor });
      const base = this.data.items.length;
      this.applyItems(
        [...this.data.items, ...res.items.map((entry, idx) => toItem(entry, base + idx))],
        res.nextCursor,
        false,
      );
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
      url: `/pkgCollection/viewer/index?collectionId=${encodeURIComponent(item.collection.id)}&photoId=${encodeURIComponent(item.id)}`,
    });
  },

  async onFavoriteToggle(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    const photoId = e.detail.photoId;
    const idx = this.data.items.findIndex((i) => i.id === photoId);
    if (idx < 0) return;
    const prev = this.data.items;
    this.applyItems(prev.filter((_, i) => i !== idx), this.data.nextCursor, false);
    try {
      await favoritesService.remove(photoId);
      // We already applied the removal locally; sync the version so returning to
      // the tab doesn't trigger a redundant in-place refetch for our own change.
      lastLoadedVersion = getContentVersion();
    } catch (err) {
      // Show the real underlying error so users can tell "expired token"
      // from "network down" from "server 5xx" — generic toasts hide which.
      // If onAuthFailure already kicked off a redirect to /pages/login, the
      // toast still fires (harmlessly) before reLaunch swaps pages.
      const msg = err instanceof Error ? err.message : '取消最爱失败';
      this.applyItems(prev, this.data.nextCursor, false);
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
    }
  },

  applyItems(items: Item[], nextCursor: string | null, enterAnim?: boolean) {
    const columns = splitColumns(items);
    const patch: {
      items: Item[];
      leftItems: Item[];
      rightItems: Item[];
      nextCursor: string | null;
      enterAnim?: boolean;
    } = {
      items,
      leftItems: columns.left,
      rightItems: columns.right,
      nextCursor,
    };
    if (enterAnim !== undefined) patch.enterAnim = enterAnim;
    this.setData(patch);
  },
});

function estimateCardHeight(item: Item): number {
  // Same clamped aspect range used by photoFrameStyle(). Add a small fixed
  // allowance for caption/subtitle/actor rows so the two columns stay roughly
  // balanced without doing layout reads in the mini-program runtime.
  const raw = item.photo.width && item.photo.height
    ? (item.photo.height / item.photo.width) * 100
    : 75;
  const aspect = Math.max(50, Math.min(160, raw));
  return aspect + 34 + item.actors.length * 13 + (item.remainingActors > 0 ? 11 : 0);
}

function splitColumns(items: Item[]): { left: Item[]; right: Item[] } {
  const left: Item[] = [];
  const right: Item[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  for (const item of items) {
    const h = estimateCardHeight(item);
    if (leftHeight <= rightHeight) {
      left.push(item);
      leftHeight += h;
    } else {
      right.push(item);
      rightHeight += h;
    }
  }
  return { left, right };
}
