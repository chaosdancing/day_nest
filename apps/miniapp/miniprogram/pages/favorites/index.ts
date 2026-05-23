import type { FavoriteEntryDTO } from '@daynest/shared';
import { favoritesService } from '../../lib/services/favorites.js';

interface Item {
  id: string;
  photo: FavoriteEntryDTO['photo'];
  collection: FavoriteEntryDTO['collection'];
  favoritedBy: FavoriteEntryDTO['favoritedBy'];
}

function toItem(e: FavoriteEntryDTO): Item {
  return {
    id: e.photo.id,
    photo: e.photo,
    collection: e.collection,
    favoritedBy: e.favoritedBy,
  };
}

Page({
  data: {
    items: [] as Item[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
  },

  onShow() {
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 1 });
    if (this.data.items.length === 0 && !this.data.loading) void this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, items: [], nextCursor: null });
    try {
      const res = await favoritesService.list({ limit: 30 });
      this.setData({ items: res.items.map(toItem), nextCursor: res.nextCursor });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onLoadMore() {
    if (!this.data.nextCursor || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      const res = await favoritesService.list({ limit: 30, cursor: this.data.nextCursor });
      this.setData({
        items: [...this.data.items, ...res.items.map(toItem)],
        nextCursor: res.nextCursor,
      });
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
      url: `/pkgCollection/detail/index?id=${encodeURIComponent(item.collection.id)}&photoId=${encodeURIComponent(item.id)}`,
    });
  },

  async onFavoriteToggle(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    const photoId = e.detail.photoId;
    const idx = this.data.items.findIndex((i) => i.id === photoId);
    if (idx < 0) return;
    const prev = this.data.items;
    this.setData({ items: prev.filter((_, i) => i !== idx) });
    try {
      await favoritesService.remove(photoId);
    } catch {
      this.setData({ items: prev });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
