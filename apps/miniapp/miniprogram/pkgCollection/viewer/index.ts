import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';
import { photosService } from '../../lib/services/photos.js';
import { tagsService } from '../../lib/services/tags.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';

const ZOOM_EPSILON = 0.05;
// Pinch past this scale auto-fetches the full-res original so the zoomed image
// is sharp instead of an upscaled thumbnail.
const ZOOM_ORIGINAL_THRESHOLD = 1.15;
// Window for telling a lone tap (no-op) from a double tap (favorite).
const DOUBLE_TAP_MS = 250;
// How long the double-tap heart-pop overlay stays on screen.
const HEART_POP_MS = 700;

interface FavSnapshot {
  id: string;
  favoritedByMe: boolean;
  favoriteCount: number;
}

// Module-scoped timers (kept out of Page data so they don't widen the strict
// Page() option types and don't round-trip through setData).
let tapTimer: ReturnType<typeof setTimeout> | null = null;
let heartPopTimer: ReturnType<typeof setTimeout> | null = null;

// Local temp-file cache of full-res originals, keyed by photo id. Module-scoped
// (NOT page-instance state) so a downloaded original survives navigateBack +
// re-navigateTo within the app session: re-entering the viewer shows the sharp
// local original immediately and download/原图 stay network-free.
const originalCache = new Map<string, string>();
// Photo ids for which a pinch-zoom already kicked off an auto-original fetch,
// so a single sustained pinch doesn't re-trigger the download repeatedly.
const autoOriginalAttempted = new Set<string>();
// Live per-index scale, tracked outside Page data so we don't setData the whole
// array on every pinch frame. data.scales remains the controlled scale-value
// used to reset zoom when swiping between photos.
let liveScales: number[] = [];

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

/**
 * Best-effort image format label from the storage key extension. The photo DTO
 * carries no MIME type, so we derive it from the fileKey (e.g. "…/x.JPEG").
 * Returns "未知" when no recognisable extension is present.
 */
function fileFormatLabel(fileKey: string): string {
  const name = fileKey.split('/').pop() ?? fileKey;
  const m = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(name);
  if (!m) return '未知';
  const ext = m[1].toUpperCase();
  return ext === 'JPEG' ? 'JPG' : ext;
}

interface DerivedCurrent {
  currentFav: FavSnapshot | null;
  currentCaption: string;
  currentTakenAtLabel: string;
  currentTags: string[];
  currentDimensions: string;
  currentFormat: string;
  currentOriginalLoaded: boolean;
}

Page({
  data: {
    theme: '' as '' | 'dark',
    statusBarHeight: 20,
    photos: [] as PhotoDTO[],
    // Hi-res original src per index for the OVERLAY layer (empty until the
    // original is downloaded). The base <image> always shows the thumbnail; the
    // original crossfades on top, so upgrading never reloads the base or jumps.
    origSrcs: [] as string[],
    current: 0,
    swiperTouched: false,
    scales: [] as number[],
    anyZoomed: false,
    // Drives the brief heart-pop overlay shown on a double-tap favorite.
    heartPop: false,
    loading: true,
    currentFav: null as FavSnapshot | null,
    currentCaption: '',
    currentTakenAtLabel: '',
    currentTags: [] as string[],
    currentDimensions: '',
    currentFormat: '',
    // Whether the CURRENT photo is showing its full-res original (vs thumbnail).
    currentOriginalLoaded: false,
    // Transient per-action states for the current photo.
    loadingOriginal: false,
    downloading: false,
    // Info / EXIF drawer.
    draftCaption: '',
    draftTags: [] as string[],
    tagSuggestions: [] as string[],
    infoOpen: false,
    // Within the drawer, metadata leads (read-only); editing reveals the
    // editable caption + tags.
    editingInfo: false,
    savingInfo: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    applyTheme(this);
    // originalCache + autoOriginalAttempted are intentionally module-scoped and
    // are NOT cleared here: temp-file originals downloaded in a prior visit stay
    // valid for the app session, so re-entering the viewer shows them instantly.
    // Only the transient per-view scale array is reset (load() rebuilds it).
    liveScales = [];
    try {
      const info = wx.getSystemInfoSync();
      if (typeof info.statusBarHeight === 'number') {
        this.setData({ statusBarHeight: info.statusBarHeight });
      }
    } catch {
      // Fall back to the default inset if the sync read is unavailable.
    }
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

  onUnload() {
    disposeTheme(this);
    if (tapTimer !== null) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }
    if (heartPopTimer !== null) {
      clearTimeout(heartPopTimer);
      heartPopTimer = null;
    }
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/timeline/index' });
      },
    });
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
      // Seed the overlay src from the persistent original cache: if this photo's
      // full-res original was already downloaded (this or a prior visit), the
      // hi-res layer shows the local temp file straight away; otherwise it stays
      // empty and only the thumbnail base is shown.
      const origSrcs = collection.photos.map((p) => originalCache.get(p.id) ?? '');
      liveScales = collection.photos.map(() => 1);
      this.setData({
        photos: collection.photos,
        origSrcs,
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

  deriveCurrent(photos: PhotoDTO[], current: number): DerivedCurrent {
    const p = photos[current];
    if (!p) {
      return {
        currentFav: null,
        currentCaption: '',
        currentTakenAtLabel: '',
        currentTags: [],
        currentDimensions: '',
        currentFormat: '',
        currentOriginalLoaded: false,
      };
    }
    return {
      currentFav: {
        id: p.id,
        favoritedByMe: p.favoritedByMe,
        favoriteCount: p.favoriteCount,
      },
      currentCaption: p.caption ?? '',
      currentTakenAtLabel: p.takenAt ? formatTakenAt(p.takenAt) : '',
      currentTags: p.tags ?? [],
      currentDimensions: `${p.width} × ${p.height}`,
      currentFormat: fileFormatLabel(p.fileKey),
      // Original-loaded is tracked by the temp-file cache (the overlay layer is
      // driven from the same cache), so the 原图 status stays in sync.
      currentOriginalLoaded: originalCache.has(p.id),
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
    liveScales = this.data.photos.map(() => 1);
    this.setData({
      current,
      scales,
      anyZoomed: false,
      infoOpen: false,
      editingInfo: false,
      loadingOriginal: false,
      ...this.deriveCurrent(this.data.photos, current),
    });
  },

  /**
   * Pinch handler. We deliberately do NOT write `scale-value` back to the
   * movable-view during the gesture: the native pinch already drives the
   * transform smoothly, and re-applying the controlled prop each frame makes it
   * fight the gesture and stutter/jump. So we only track the live scale outside
   * `data` and flip `anyZoomed` when it actually changes. Zooming past the
   * threshold also auto-loads the full-res original (once per photo).
   */
  onScale(e: WechatMiniprogram.CustomEvent<{ scale: number; x: number; y: number }>) {
    const idx = Number(e.currentTarget.dataset.index ?? 0);
    const scale = e.detail.scale;
    liveScales[idx] = scale;
    const anyZoomed = liveScales.some((s) => s > 1 + ZOOM_EPSILON);
    if (anyZoomed !== this.data.anyZoomed) this.setData({ anyZoomed });
    this.maybeAutoLoadOriginal(idx, scale);
  },

  /**
   * When the user pinches in on a photo whose original hasn't been fetched yet,
   * resolve it once (non-blocking) so the zoomed image becomes sharp. Guarded
   * by an attempted-set so a sustained pinch doesn't fire repeated downloads.
   */
  maybeAutoLoadOriginal(idx: number, scale: number) {
    if (scale <= ZOOM_ORIGINAL_THRESHOLD) return;
    const photo = this.data.photos[idx];
    if (!photo) return;
    if (originalCache.has(photo.id)) return;
    if (this.data.loadingOriginal) return;
    if (autoOriginalAttempted.has(photo.id)) return;
    autoOriginalAttempted.add(photo.id);
    this.setData({ loadingOriginal: true });
    this.resolveOriginal(idx)
      .then(() => {
        this.setData({ loadingOriginal: false });
      })
      .catch(() => {
        // Allow a later retry (e.g. a fresh pinch) if this fetch failed.
        autoOriginalAttempted.delete(photo.id);
        this.setData({ loadingOriginal: false });
      });
  },

  onLongPress(_e: WechatMiniprogram.TouchEvent) {
    const urls = this.data.photos.map((p) => p.thumbnailUrl);
    const current = this.data.photos[this.data.current]?.thumbnailUrl ?? urls[0];
    wx.previewImage({ current, urls });
  },

  /**
   * Photo tap dispatcher.
   * - While pinch-zoomed, a single tap resets the zoom back to the fit view
   *   ("tap to return") and we don't run the double-tap detection.
   * - Otherwise a lone tap does nothing (chrome is always visible now); a
   *   second tap within DOUBLE_TAP_MS is a double-tap favorite.
   */
  onPhotoTap() {
    if (this.data.anyZoomed) {
      this.resetZoom();
      return;
    }
    if (tapTimer !== null) {
      clearTimeout(tapTimer);
      tapTimer = null;
      this.onDoubleTapPhoto();
      return;
    }
    tapTimer = setTimeout(() => {
      tapTimer = null;
      // Lone tap: intentionally a no-op (no immersive/fullscreen toggle).
    }, DOUBLE_TAP_MS);
  },

  /**
   * Animate the current photo's movable-view back to scale 1. Because we don't
   * sync scale-value during the pinch, `data.scales[idx]` is stale (still 1)
   * while the view is actually zoomed — so setting it straight to 1 wouldn't
   * register as a change and nothing would animate. We first set scale-value to
   * the live scale (matches what's on screen, no visible jump) and then, on the
   * next tick, to 1 so the movable-view animates the reset back to fit.
   */
  resetZoom() {
    const idx = this.data.current;
    const live = liveScales[idx] ?? 1;
    if (live <= 1 + ZOOM_EPSILON) {
      if (this.data.anyZoomed) this.setData({ anyZoomed: false });
      return;
    }
    this.setData({ [`scales[${idx}]`]: live }, () => {
      liveScales[idx] = 1;
      this.setData({ [`scales[${idx}]`]: 1, anyZoomed: false });
    });
  },

  onDoubleTapPhoto() {
    this.triggerHeartPop();
    void this.onFavoriteTap();
  },

  triggerHeartPop() {
    if (heartPopTimer !== null) clearTimeout(heartPopTimer);
    // Re-arm cleanly: drop the node first so re-tapping replays the animation.
    this.setData({ heartPop: false });
    this.setData({ heartPop: true });
    heartPopTimer = setTimeout(() => {
      heartPopTimer = null;
      this.setData({ heartPop: false });
    }, HEART_POP_MS);
  },

  /**
   * Resolve the full-res original for a photo as a LOCAL temp file path. On a
   * cache miss it signs the URL and downloads it to a temp file, caches the
   * path by photo id, and swaps the on-screen <image> to the sharp local file.
   * Returns the cached path instantly on subsequent calls (so download is
   * network-free once viewed). Guards against the user swiping away mid-fetch
   * by re-locating the photo by id before writing back.
   */
  async resolveOriginal(idx: number): Promise<string> {
    const photo = this.data.photos[idx];
    if (!photo) throw new Error('照片不存在');
    const cached = originalCache.get(photo.id);
    if (cached) return cached;
    const { url } = await photosService.getUrl(photo.id);
    const tempPath = await this.downloadToTemp(url);
    originalCache.set(photo.id, tempPath);
    const targetIdx =
      this.data.photos[idx]?.id === photo.id
        ? idx
        : this.data.photos.findIndex((p) => p.id === photo.id);
    if (targetIdx >= 0) {
      // Set the OVERLAY src — the hi-res layer crossfades in over the thumbnail
      // base, so the upgrade is seamless (no reload/jump of the visible image).
      const patch: Record<string, unknown> = { [`origSrcs[${targetIdx}]`]: tempPath };
      if (targetIdx === this.data.current) patch.currentOriginalLoaded = true;
      this.setData(patch);
    }
    return tempPath;
  },

  /** Swap the current image to its full-res original in place. */
  async onViewOriginal() {
    const idx = this.data.current;
    const photo = this.data.photos[idx];
    if (!photo) return;
    if (this.data.currentOriginalLoaded || this.data.loadingOriginal) return;
    this.setData({ loadingOriginal: true });
    try {
      await this.resolveOriginal(idx);
      this.setData({ loadingOriginal: false });
      wx.showToast({ title: '已切换原图', icon: 'none' });
    } catch (err) {
      this.setData({ loadingOriginal: false });
      const msg = err instanceof Error ? err.message : '原图加载失败';
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
    }
  },

  /**
   * Save the CURRENT photo to the system album. Prefers the full-res original
   * (fetched on demand), falling back to the thumbnail if that fetch fails.
   * Walks the scope.writePhotosAlbum permission flow before downloading.
   */
  async onDownload() {
    const idx = this.data.current;
    const photo = this.data.photos[idx];
    if (!photo || this.data.downloading) return;
    this.setData({ downloading: true });
    try {
      await this.ensureAlbumPermission();
    } catch (err) {
      this.setData({ downloading: false });
      if (err instanceof Error && err.message) {
        wx.showToast({ title: err.message.slice(0, 30), icon: 'none' });
      }
      return;
    }
    wx.showLoading({ title: '保存中…', mask: true });
    try {
      let filePath: string;
      try {
        // Instant when the original is already a cached local temp file; only
        // hits the network on a cold cache.
        filePath = await this.resolveOriginal(idx);
      } catch {
        // Original unavailable — fall back to downloading the thumbnail so the
        // save still succeeds with the best image we have.
        filePath = await this.downloadToTemp(photo.thumbnailUrl);
      }
      await this.saveToAlbum(filePath);
      wx.hideLoading();
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      const msg = err instanceof Error ? err.message : '保存失败';
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
    } finally {
      this.setData({ downloading: false });
    }
  },

  ensureAlbumPermission(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          const auth = res.authSetting['scope.writePhotosAlbum'];
          if (auth === true) {
            resolve();
            return;
          }
          if (auth === false) {
            // Previously denied — WeChat won't re-prompt, so guide to 设置.
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许“保存到相册”后再试。',
              confirmText: '去设置',
              cancelText: '取消',
              success: (m) => {
                if (!m.confirm) {
                  reject(new Error(''));
                  return;
                }
                wx.openSetting({
                  success: (s) => {
                    if (s.authSetting['scope.writePhotosAlbum']) resolve();
                    else reject(new Error('未获得相册权限'));
                  },
                  fail: () => reject(new Error('未获得相册权限')),
                });
              },
              fail: () => reject(new Error('')),
            });
            return;
          }
          // Never asked before — request the scope now.
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: () => resolve(),
            fail: () => reject(new Error('未获得相册权限')),
          });
        },
        fail: () => reject(new Error('无法读取权限设置')),
      });
    });
  },

  downloadToTemp(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath);
          else reject(new Error(`下载失败 (${res.statusCode})`));
        },
        fail: (e) => reject(new Error(e.errMsg || '下载失败')),
      });
    });
  },

  saveToAlbum(filePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => resolve(),
        fail: (e) => reject(new Error(e.errMsg || '保存失败')),
      });
    });
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
    liveScales = this.data.photos.map(() => 1);
    this.setData({
      current: next,
      scales,
      anyZoomed: false,
      loadingOriginal: false,
      ...this.deriveCurrent(this.data.photos, next),
    });
  },
  onNext() {
    if (this.data.current >= this.data.photos.length - 1) return;
    const next = this.data.current + 1;
    const scales = this.data.photos.map(() => 1);
    liveScales = this.data.photos.map(() => 1);
    this.setData({
      current: next,
      scales,
      anyZoomed: false,
      loadingOriginal: false,
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
      this.setData({ infoOpen: false, editingInfo: false });
      return;
    }
    this.setData({ infoOpen: true, editingInfo: false });
  },

  onInfoNoop() {
    // Swallow taps inside the drawer so the mask's bindtap doesn't close it.
  },

  onStartEditInfo() {
    const p = this.data.photos[this.data.current];
    this.setData({
      editingInfo: true,
      draftCaption: p?.caption ?? '',
      draftTags: [...(p?.tags ?? [])],
    });
  },

  /**
   * Tapping the bottom caption/tags overlay jumps straight into the drawer in
   * edit mode so captions + tags are quick to change.
   */
  onOpenEditFromCaption() {
    const p = this.data.photos[this.data.current];
    this.setData({
      infoOpen: true,
      editingInfo: true,
      draftCaption: p?.caption ?? '',
      draftTags: [...(p?.tags ?? [])],
    });
  },

  onCancelEditInfo() {
    this.setData({ editingInfo: false });
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
        editingInfo: false,
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
