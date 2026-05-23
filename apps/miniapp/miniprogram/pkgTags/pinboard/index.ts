import type { CollectionSummaryDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';

type Scope = 'all' | 'collection' | 'photo';

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'collection', label: '集合标签' },
  { key: 'photo', label: '照片标签' },
];

Page({
  data: {
    tagName: '' as string,
    tagDisplay: '' as string,
    scopes: SCOPES,
    scope: 'all' as Scope,
    items: [] as CollectionSummaryDTO[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const tag = decodeURIComponent(query.tag ?? '');
    const display = decodeURIComponent(query.display ?? tag);
    const scope = ((query.scope as Scope) || 'all');
    this.setData({ tagName: tag, tagDisplay: display, scope });
    if (!tag) {
      wx.showToast({ title: '缺少标签名', icon: 'none' });
      return;
    }
    void this.refresh();
  },

  onPullDownRefresh() {
    void this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (!this.data.tagName || this.data.loading) return;
    this.setData({ loading: true, items: [], nextCursor: null });
    try {
      const res = await collectionsService.list({
        limit: 20,
        tag: this.data.tagName,
        tagScope: this.data.scope,
      });
      this.setData({ items: res.items, nextCursor: res.nextCursor });
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
      const res = await collectionsService.list({
        limit: 20,
        cursor: this.data.nextCursor,
        tag: this.data.tagName,
        tagScope: this.data.scope,
      });
      this.setData({
        items: [...this.data.items, ...res.items],
        nextCursor: res.nextCursor,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onScopeTap(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as Scope;
    if (key === this.data.scope) return;
    this.setData({ scope: key });
    void this.refresh();
  },

  onCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pkgCollection/detail/index?id=${encodeURIComponent(id)}` });
  },

  onEditTap() {
    wx.navigateTo({
      url: `/pkgTags/rename/index?tag=${encodeURIComponent(this.data.tagName)}&display=${encodeURIComponent(this.data.tagDisplay)}`,
    });
  },
});
