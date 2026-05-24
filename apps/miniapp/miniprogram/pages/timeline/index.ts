import type { CollectionSummaryDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { debounce, type DebouncedFn } from '../../lib/debounce.js';

interface FilterChange {
  dateFrom?: string;
  dateTo?: string;
  location?: string;
}

/**
 * Row view shape — extends the DTO with a pre-computed `displayDate`
 * (YYYY.MM.DD or "YYYY.MM.DD - YYYY.MM.DD" for ranged collections) so the
 * WXML stays simple. We mirror apps/web/src/pages/TimelinePage.tsx#formatOccurred.
 */
type RowView = CollectionSummaryDTO & { displayDate: string };

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

function toRowViews(items: CollectionSummaryDTO[]): RowView[] {
  return items.map((c) => ({
    ...c,
    displayDate: formatOccurredDot(c.occurredOn, c.occurredUntil),
  }));
}

// Page-local module state for the debounce instance — kept module-scoped to
// avoid widening Page() options with non-data instance fields (TS strict mode).
let searchDebounce: DebouncedFn<[string]> | null = null;
let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;

Page({
  data: {
    items: [] as RowView[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
    searchInput: '',
    activeTitle: '',
    filter: {} as FilterChange,
    isScrolling: false,
  },

  onLoad() {
    searchDebounce = debounce<[string]>((value: string) => {
      this.setData({ activeTitle: value });
      this.refresh();
    }, 300);
  },

  onUnload() {
    searchDebounce?.cancel();
    searchDebounce = null;
    if (scrollIdleTimer !== null) {
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = null;
    }
  },

  onShow() {
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 0 });
    if (this.data.items.length === 0 && !this.data.loading) {
      void this.refresh();
    }
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true, items: [], nextCursor: null });
    try {
      const res = await collectionsService.list({
        limit: 20,
        ...this.data.filter,
        title: this.data.activeTitle || undefined,
      });
      this.setData({ items: toRowViews(res.items), nextCursor: res.nextCursor });
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
        ...this.data.filter,
        title: this.data.activeTitle || undefined,
      });
      this.setData({
        items: [...this.data.items, ...toRowViews(res.items)],
        nextCursor: res.nextCursor,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onFilterChange(e: WechatMiniprogram.CustomEvent<FilterChange>) {
    this.setData({ filter: e.detail });
    void this.refresh();
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value;
    this.setData({ searchInput: value });
    searchDebounce?.run(value);
  },

  onSearchConfirm(e: WechatMiniprogram.Input) {
    searchDebounce?.cancel();
    this.setData({ activeTitle: e.detail.value });
    void this.refresh();
  },

  onSearchClear() {
    searchDebounce?.cancel();
    this.setData({ searchInput: '', activeTitle: '' });
    void this.refresh();
  },

  onCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pkgCollection/detail/index?id=${encodeURIComponent(id)}` });
  },

  onListScroll() {
    if (!this.data.isScrolling) {
      this.setData({ isScrolling: true });
    }
    if (scrollIdleTimer !== null) clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      scrollIdleTimer = null;
      this.setData({ isScrolling: false });
    }, 180);
  },

  onFabTap() {
    wx.navigateTo({ url: '/pkgUpload/new/index' });
  },
});
