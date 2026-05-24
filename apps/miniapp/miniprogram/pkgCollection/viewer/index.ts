import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';
import { photosService } from '../../lib/services/photos.js';
import { tagsService } from '../../lib/services/tags.js';

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
    swiperTouched: false,
    scales: [] as number[],
    anyZoomed: false,
    loading: true,
    currentFav: null as FavSnapshot | null,
    currentCaption: '',
    currentTakenAtLabel: '',
    currentTags: [] as string[],
    draftCaption: '',
    draftTags: [] as string[],
    tagSuggestions: [] as string[],
    infoOpen: false,
    savingInfo: false,
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
    void this.loadTagSuggestions();
  },

  async loadTagSuggestions() {
    try {
      const tags = await tagsService.list();
      this.setData({ tagSuggestions: tags.map((t) => t.displayName) });
    } catch {
      // Suggestions are optional; free typing still works.
    }
  },

  async load(collectionId: string, photoId: string) {
    try {
      const collection = await collectionsService.get(collectionId);
      const idx = photoId ? collection.photos.findIndex((p) => p.id === photoId) : 0;
      const current = idx >= 0 ? idx : 0;
      this.setData({
        photos: collection.photos,
        current,
        swiperTouched: false,
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

  onSwiperTouchStart() {
    this.setData({ swiperTouched: true });
  },

  onChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    // WeChat swiper can emit an initialization/programmatic change with an
    // empty source while the page is mounting or while we set `current`
    // from a route photoId. If we accept that event, it can overwrite the
    // intended target index with 0, which looks like "jump twice then land
    // on the first photo". On real devices, that stale initialization event
    // can also report source="touch", so only accept touch changes after the
    // swiper itself has observed an actual touchstart.
    const current = e.detail.current;
    if (e.detail.source !== 'touch') return;
    if (!this.data.swiperTouched) return;
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

  /**
   * Chevron-button navigation. Swiper already supports horizontal swiping
   * via gesture, but tap targets are easier than swiping on a zoomed page
   * and discoverable for first-time users.
   */
  onPrev() {
    if (this.data.current <= 0) return;
    const next = this.data.current - 1;
    const scales = this.data.photos.map(() => 1);
    this.setData({
      current: next,
      scales,
      anyZoomed: false,
      ...this.deriveCurrent(this.data.photos, next),
    });
  },
  onNext() {
    if (this.data.current >= this.data.photos.length - 1) return;
    const next = this.data.current + 1;
    const scales = this.data.photos.map(() => 1);
    this.setData({
      current: next,
      scales,
      anyZoomed: false,
      ...this.deriveCurrent(this.data.photos, next),
    });
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
    } catch (err) {
      const revertPhotos = [...this.data.photos];
      revertPhotos[idx] = photo;
      // Re-derive against the CURRENT index, not the one captured at tap
      // time — the user may have swiped during the in-flight request, so
      // `currentFav` must reflect the photo they're looking at NOW.
      const cur = this.data.current;
      this.setData({
        photos: revertPhotos,
        ...this.deriveCurrent(revertPhotos, cur),
      });
      const fallback = wasFav ? '取消最爱失败' : '加入最爱失败';
      const msg = err instanceof Error ? err.message : fallback;
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
    }
  },

  onInfoToggle() {
    if (this.data.infoOpen) {
      this.setData({ infoOpen: false });
      return;
    }
    const p = this.data.photos[this.data.current];
    this.setData({
      infoOpen: true,
      draftCaption: p?.caption ?? '',
      draftTags: [...(p?.tags ?? [])],
    });
  },

  onInfoNoop() {
    // Swallow taps inside the drawer so the mask's bindtap doesn't close it.
  },

  onCaptionInput(e: WechatMiniprogram.Input) {
    this.setData({ draftCaption: e.detail.value });
  },

  onTagsChange(e: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    this.setData({ draftTags: e.detail.value });
  },

  async onSaveInfo() {
    const idx = this.data.current;
    const photo = this.data.photos[idx];
    if (!photo || this.data.savingInfo) return;
    this.setData({ savingInfo: true });
    try {
      const updated = await photosService.update(photo.id, {
        caption: this.data.draftCaption.trim() || null,
        tags: this.data.draftTags,
      });
      const photos = [...this.data.photos];
      photos[idx] = updated;
      this.setData({
        photos,
        infoOpen: false,
        savingInfo: false,
        ...this.deriveCurrent(photos, idx),
      });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
      this.setData({ savingInfo: false });
    }
  },
});
