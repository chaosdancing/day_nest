import type { CollectionDetailDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';
import { tagsService } from '../../lib/services/tags.js';
import { stableAngle, stableInt } from '../../lib/hash.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';

type PhotoView = CollectionDetailDTO['photos'][number] & {
  /** Precomputed natural-aspect frame style for photo-tile. */
  frameStyle: string;
};

/** Pre-formatted "YYYY.MM.DD" or "YYYY.MM.DD - YYYY.MM.DD" string. */
function formatOccurredDot(
  occurredOn: string,
  occurredUntil: string | null,
): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}.${m}.${day}`;
  };
  const startStr = fmt(occurredOn);
  if (!occurredUntil) return startStr;
  const startDate = new Date(occurredOn).toDateString();
  const endDate = new Date(occurredUntil).toDateString();
  if (startDate === endDate) return startStr;
  return `${startStr} - ${fmt(occurredUntil)}`;
}

function photoFrameStyle(photo: CollectionDetailDTO['photos'][number]): string {
  if (!photo.width || !photo.height) return '';
  const raw = (photo.height / photo.width) * 100;
  const clamped = Math.max(50, Math.min(160, raw));
  return `padding-top: ${Number(clamped.toFixed(2))}%`;
}

function toPhotoView(photo: CollectionDetailDTO['photos'][number]): PhotoView {
  return {
    ...photo,
    frameStyle: photoFrameStyle(photo),
  };
}

function estimateCardHeight(photo: PhotoView): number {
  const raw = photo.width && photo.height ? (photo.height / photo.width) * 100 : 75;
  const aspect = Math.max(50, Math.min(160, raw));
  return aspect + (photo.caption ? 24 : 0) + 24;
}

function splitColumns(photos: PhotoView[]): { left: PhotoView[]; right: PhotoView[] } {
  const left: PhotoView[] = [];
  const right: PhotoView[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  for (const photo of photos) {
    const h = estimateCardHeight(photo);
    if (leftHeight <= rightHeight) {
      left.push(photo);
      leftHeight += h;
    } else {
      right.push(photo);
      rightHeight += h;
    }
  }
  return { left, right };
}

Page({
  data: {
    theme: '' as '' | 'dark',
    collection: null as CollectionDetailDTO | null,
    leftPhotos: [] as PhotoView[],
    rightPhotos: [] as PhotoView[],
    displayDate: '' as string,
    /** Deterministic tilt for the hero polaroid (degrees). */
    heroAngle: 0 as number,
    /** 0-3 — picks which `tape--N` colored chip to render on the hero. */
    heroTape: 0 as number,
    loading: false,
    editOpen: false,
    savingEdit: false,
    draftTitle: '',
    draftDescription: '',
    draftLocation: '',
    draftOccurredOn: '',
    draftTags: [] as string[],
    tagSuggestions: [] as string[],
  },

  onLoad(query: Record<string, string | undefined>) {
    applyTheme(this);
    const id = decodeURIComponent(query.id ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    if (!id) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      return;
    }
    if (photoId) {
      wx.redirectTo({
        url: `/pkgCollection/viewer/index?collectionId=${encodeURIComponent(id)}&photoId=${encodeURIComponent(photoId)}`,
      });
      return;
    }
    void this.fetch(id);
    void this.loadTagSuggestions();
  },

  onUnload() {
    disposeTheme(this);
  },

  async loadTagSuggestions() {
    try {
      const tags = await tagsService.list();
      this.setData({ tagSuggestions: tags.map((t) => t.displayName) });
    } catch {
      // Suggestions are optional; users can still type tags.
    }
  },

  async fetch(id: string) {
    this.setData({ loading: true });
    try {
      const collection = await collectionsService.get(id);
      const photos = collection.photos.map(toPhotoView);
      const columns = splitColumns(photos);
      this.setData({
        collection,
        leftPhotos: columns.left,
        rightPhotos: columns.right,
        displayDate: formatOccurredDot(collection.occurredOn, collection.occurredUntil),
        heroAngle: stableAngle(`hero-${collection.id}`, 2),
        heroTape: stableInt(`hero-tape-${collection.id}`, 4),
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onPhotoTap(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    if (!this.data.collection) return;
    wx.navigateTo({
      url: `/pkgCollection/viewer/index?collectionId=${encodeURIComponent(this.data.collection.id)}&photoId=${encodeURIComponent(e.detail.photoId)}`,
    });
  },

  async onFavoriteToggle(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    if (!this.data.collection) return;
    const photoId = e.detail.photoId;
    const idx = this.data.collection.photos.findIndex((p) => p.id === photoId);
    if (idx < 0) return;
    const photo = this.data.collection.photos[idx]!;
    const wasFav = photo.favoritedByMe;
    const updated = {
      ...photo,
      favoritedByMe: !wasFav,
      favoriteCount: photo.favoriteCount + (wasFav ? -1 : 1),
    };
    const newPhotos = [...this.data.collection.photos];
    newPhotos[idx] = updated;
    this.applyPhotos({ ...this.data.collection, photos: newPhotos });

    try {
      if (wasFav) {
        await favoritesService.remove(photoId);
      } else {
        await favoritesService.add(photoId);
      }
    } catch (err) {
      const revertPhotos = [...this.data.collection!.photos];
      revertPhotos[idx] = photo;
      this.applyPhotos({ ...this.data.collection!, photos: revertPhotos });
      const fallback = wasFav ? '取消最爱失败' : '加入最爱失败';
      const msg = err instanceof Error ? err.message : fallback;
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
    }
  },

  applyPhotos(collection: CollectionDetailDTO) {
    const photos = collection.photos.map(toPhotoView);
    const columns = splitColumns(photos);
    this.setData({
      collection,
      leftPhotos: columns.left,
      rightPhotos: columns.right,
    });
  },

  onEditTap() {
    const c = this.data.collection;
    if (!c) return;
    this.setData({
      editOpen: true,
      draftTitle: c.title,
      draftDescription: c.description ?? '',
      draftLocation: c.location ?? '',
      draftOccurredOn: c.occurredOn.slice(0, 10),
      draftTags: c.tags.map((t) => t.displayName),
    });
  },

  onEditClose() {
    if (this.data.savingEdit) return;
    this.setData({ editOpen: false });
  },

  onEditNoop() {
    // Keep taps inside the bottom sheet from closing it.
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    this.setData({ draftTitle: e.detail.value });
  },

  onDescriptionInput(e: WechatMiniprogram.Input) {
    this.setData({ draftDescription: e.detail.value });
  },

  onLocationInput(e: WechatMiniprogram.Input) {
    this.setData({ draftLocation: e.detail.value });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ draftOccurredOn: e.detail.value as string });
  },

  onTagsChange(e: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    this.setData({ draftTags: e.detail.value });
  },

  async onSaveEdit() {
    const c = this.data.collection;
    if (!c || this.data.savingEdit) return;
    const title = this.data.draftTitle.trim();
    if (!title) {
      wx.showToast({ title: '标题不能为空', icon: 'none' });
      return;
    }
    this.setData({ savingEdit: true });
    try {
      const updated = await collectionsService.update(c.id, {
        title,
        description: this.data.draftDescription.trim() || null,
        occurredOn: this.data.draftOccurredOn,
        occurredUntil: c.occurredUntil ? c.occurredUntil.slice(0, 10) : null,
        location: this.data.draftLocation.trim() || null,
        tags: this.data.draftTags,
      });
      this.applyPhotos(updated);
      this.setData({
        editOpen: false,
        savingEdit: false,
        displayDate: formatOccurredDot(updated.occurredOn, updated.occurredUntil),
      });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
      this.setData({ savingEdit: false });
    }
  },
});
