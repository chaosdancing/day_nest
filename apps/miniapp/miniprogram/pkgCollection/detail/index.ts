import type { CollectionDetailDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';

Page({
  data: {
    collection: null as CollectionDetailDTO | null,
    loading: false,
    initialPhotoId: '' as string,
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = decodeURIComponent(query.id ?? '');
    const photoId = decodeURIComponent(query.photoId ?? '');
    this.setData({ initialPhotoId: photoId });
    if (!id) {
      wx.showToast({ title: '缺少集合 id', icon: 'none' });
      return;
    }
    void this.fetch(id);
  },

  async fetch(id: string) {
    this.setData({ loading: true });
    try {
      const collection = await collectionsService.get(id);
      this.setData({ collection });
      if (this.data.initialPhotoId) {
        wx.pageScrollTo({ selector: `#photo-${this.data.initialPhotoId}`, duration: 200 });
      }
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
    this.setData({ collection: { ...this.data.collection, photos: newPhotos } });

    try {
      if (wasFav) {
        await favoritesService.remove(photoId);
      } else {
        await favoritesService.add(photoId);
      }
    } catch {
      const revertPhotos = [...this.data.collection!.photos];
      revertPhotos[idx] = photo;
      this.setData({ collection: { ...this.data.collection!, photos: revertPhotos } });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
