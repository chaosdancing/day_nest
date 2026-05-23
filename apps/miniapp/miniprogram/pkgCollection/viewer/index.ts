import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';

const ZOOM_EPSILON = 0.05;

Page({
  data: {
    photos: [] as PhotoDTO[],
    current: 0,
    scales: [] as number[],
    anyZoomed: false,
    loading: true,
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
      this.setData({
        photos: collection.photos,
        current: idx >= 0 ? idx : 0,
        scales: collection.photos.map(() => 1),
        anyZoomed: false,
        loading: false,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    // Reset all scales when the user swipes; otherwise a half-zoomed slide
    // could persist its zoom state when revisited.
    const scales = this.data.photos.map(() => 1);
    this.setData({
      current: e.detail.current,
      scales,
      anyZoomed: false,
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
});
