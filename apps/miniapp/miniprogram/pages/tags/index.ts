import type { TagDTO } from '@daynest/shared';
import { tagsService } from '../../lib/services/tags.js';

Page({
  data: {
    tags: [] as TagDTO[],
    popular: [] as TagDTO[],
    collectionTags: [] as TagDTO[],
    photoOnlyTags: [] as TagDTO[],
    view: 'flat' as 'flat' | 'categorized',
    loading: false,
  },

  onShow() {
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 2 });
    if (this.data.tags.length === 0 && !this.data.loading) void this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const tags = await tagsService.list();
      const popular = [...tags]
        .sort((a, b) => ((b.photoCount ?? 0) + (b.collectionCount ?? 0)) - ((a.photoCount ?? 0) + (a.collectionCount ?? 0)))
        .slice(0, 6);
      const collectionTags = tags.filter((t) => (t.collectionCount ?? 0) > 0);
      const photoOnlyTags = tags.filter((t) => (t.collectionCount ?? 0) === 0 && (t.photoCount ?? 0) > 0);
      this.setData({ tags, popular, collectionTags, photoOnlyTags });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSwitchView(e: WechatMiniprogram.TouchEvent) {
    const view = e.currentTarget.dataset.view as 'flat' | 'categorized';
    this.setData({ view });
  },

  onTagTap(e: WechatMiniprogram.TouchEvent) {
    const name = e.currentTarget.dataset.name as string;
    if (!name) return;
    const tag = this.data.tags.find((t) => t.name === name);
    const display = tag?.displayName ?? name;
    wx.navigateTo({
      url: `/pkgTags/pinboard/index?tag=${encodeURIComponent(name)}&display=${encodeURIComponent(display)}`,
    });
  },
});
