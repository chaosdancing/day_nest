import type { PhotoDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';

Page({
  data: {
    photos: [] as PhotoDTO[],
    current: 0,
    loading: true,
  },

  onLoad(query: Record<string, string | undefined>) {
    const collectionId = decodeURIComponent(query.collectionId ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    if (!collectionId) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      return;
    }
    void this.load(collectionId, photoId);
  },

  async load(collectionId: string, photoId: string) {
    try {
      const collection = await collectionsService.get(collectionId);
      const idx = photoId
        ? collection.photos.findIndex((p) => p.id === photoId)
        : 0;
      this.setData({
        photos: collection.photos,
        current: idx >= 0 ? idx : 0,
        loading: false,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onChange(e: WechatMiniprogram.CustomEvent<{ current: number; source: string }>) {
    this.setData({ current: e.detail.current });
  },

  onLongPress(_e: WechatMiniprogram.TouchEvent) {
    const urls = this.data.photos.map((p) => p.thumbnailUrl);
    const current = this.data.photos[this.data.current]?.thumbnailUrl ?? urls[0];
    wx.previewImage({
      current,
      urls,
    });
  },
});
