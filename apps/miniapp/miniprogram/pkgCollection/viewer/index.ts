import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';

const ZOOM_EPSILON = 0.05;

interface FavSnapshot {
  id: string;
  favoritedByMe: boolean;
  favoriteCount: number;
}

Page({
  data: {
    photos: [] as PhotoDTO[],
    current: 0,
    scales: [] as number[],
    anyZoomed: false,
    loading: true,
    currentFav: null as FavSnapshot | null,
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
  },

  async load(collectionId: string, photoId: string) {
    try {
      const collection = await collectionsService.get(collectionId);
      const idx = photoId ? collection.photos.findIndex((p) => p.id === photoId) : 0;
      const current = idx >= 0 ? idx : 0;
      this.setData({
        photos: collection.photos,
        current,
        scales: collection.photos.map(() => 1),
        anyZoomed: false,
        loading: false,
        currentFav: this.snapshotFav(collection.photos, current),
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  snapshotFav(photos: PhotoDTO[], current: number): FavSnapshot | null {
    const p = photos[current];
    if (!p) return null;
    return { id: p.id, favoritedByMe: p.favoritedByMe, favoriteCount: p.favoriteCount };
  },

  onChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    const current = e.detail.current;
    const scales = this.data.photos.map(() => 1);
    this.setData({
      current,
      scales,
      anyZoomed: false,
      currentFav: this.snapshotFav(this.data.photos, current),
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
      currentFav: this.snapshotFav(newPhotos, idx),
    });
    try {
      if (wasFav) {
        await favoritesService.remove(photo.id);
      } else {
        await favoritesService.add(photo.id);
      }
    } catch {
      // revert
      const revertPhotos = [...this.data.photos];
      revertPhotos[idx] = photo;
      this.setData({
        photos: revertPhotos,
        currentFav: this.snapshotFav(revertPhotos, idx),
      });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
