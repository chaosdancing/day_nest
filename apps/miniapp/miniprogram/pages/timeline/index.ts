import type { CollectionSummaryDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { debounce, type DebouncedFn } from '../../lib/debounce.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';
import { consumeTabSlide } from '../../lib/tabTransition.js';
import { getContentVersion } from '../../lib/contentVersion.js';
import { buildPresetRange } from '../../lib/dateRange.js';
import { ensureCanUpload } from '../../lib/uploadGate.js';
import { enableShareMenu } from '../../lib/shareMenu.js';

interface FilterChange {
  dateFrom?: string;
  dateTo?: string;
  location?: string;
}

/**
 * Friendly label for the active date range, derived purely from the
 * {dateFrom,dateTo} the filter component emitted. Lets the collapsed control
 * bar show a tiny summary chip ("今年" / "当月" / a literal custom range)
 * without the component having to expose its internal preset state.
 */
function dateSummaryLabel(filter: FilterChange): string {
  if (!filter.dateFrom && !filter.dateTo) return '';
  const year = buildPresetRange('year');
  if (filter.dateFrom === year.dateFrom && filter.dateTo === year.dateTo) {
    return '今年';
  }
  const month = buildPresetRange('month');
  if (filter.dateFrom === month.dateFrom && filter.dateTo === month.dateTo) {
    return '当月';
  }
  const dot = (s?: string) => (s ? s.replace(/-/g, '.') : '…');
  return `${dot(filter.dateFrom)}–${dot(filter.dateTo)}`;
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
let slideTimer: ReturnType<typeof setTimeout> | null = null;
// Tracks whether onShow has run at least once. Lets us skip the redundant
// refresh on first mount (onShow already kicks off the initial load) while
// still re-pulling the list when the user returns to the tab.
let hasShown = false;
// Guards against overlapping loads (in-place onShow refresh vs filter refresh).
let inFlight = false;
// The staggered entrance animation must play only on the FIRST load, never on
// an onShow refresh — otherwise returning to the tab visibly re-animates.
let animatedOnce = false;
// Content version captured on the last successful list load. onShow only
// refetches when the version changed (something was created/edited/favorited)
// so an unchanged tab switch never re-signs thumbnail URLs (= no flicker).
let lastLoadedVersion = -1;

Page({
  data: {
    theme: '' as '' | 'dark',
    items: [] as RowView[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
    searchInput: '',
    activeTitle: '',
    filter: {} as FilterChange,
    // Collapsible filter panel — collapsed by default so the list gets the
    // vertical space. The search input stays inline in the bar; tapping 筛选
    // expands the date/location panel below. The collapsed bar shows a derived
    // summary of any active date/location filters.
    filtersOpen: false,
    hasActiveFilters: false,
    summaryDate: '',
    isScrolling: false,
    // One-shot tab slide-in class set on the root view in onShow.
    slide: '' as '' | 'slide-in-right' | 'slide-in-left',
    // Gates the per-row entrance animation to the first load only.
    enterAnim: true,
  },

  onLoad() {
    applyTheme(this);
    hasShown = false;
    animatedOnce = false;
    searchDebounce = debounce<[string]>((value: string) => {
      this.setData({ activeTitle: value });
      this.updateFilterSummary();
      this.refresh();
    }, 300);
  },

  onUnload() {
    disposeTheme(this);
    searchDebounce?.cancel();
    searchDebounce = null;
    if (scrollIdleTimer !== null) {
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = null;
    }
    if (slideTimer !== null) {
      clearTimeout(slideTimer);
      slideTimer = null;
    }
  },

  onShow() {
    enableShareMenu();
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 0 });
    this.playTabSlide();
    if (!hasShown) {
      // First mount — load only if we have nothing yet (avoids double-load).
      hasShown = true;
      if (this.data.items.length === 0 && !inFlight) {
        void this.refresh();
      }
    } else if (this.data.items.length === 0 || getContentVersion() !== lastLoadedVersion) {
      // Returning to the tab — only re-pull when we have nothing yet or content
      // actually changed since the last load. Refresh IN PLACE so even a
      // legitimate refresh doesn't clear/re-animate (no flicker). When nothing
      // changed we skip the network call entirely → zero thumbnail re-signing.
      void this.refresh(true);
    }
  },

  /** Apply the one-shot directional slide-in handed over by the tab bar. */
  playTabSlide() {
    const slide = consumeTabSlide();
    if (!slide) return;
    if (slideTimer !== null) clearTimeout(slideTimer);
    this.setData({ slide });
    slideTimer = setTimeout(() => {
      slideTimer = null;
      this.setData({ slide: '' });
    }, 280);
  },

  onPullDownRefresh() {
    this.refresh(true).finally(() => wx.stopPullDownRefresh());
  },

  /**
   * @param inPlace When true (onShow / pull-to-refresh), keep the existing
   * rows visible and swap them only once new data arrives — no empty/loading
   * flash and no entrance re-animation. A fresh load (first mount, filter,
   * search) clears to the loading state as before.
   */
  async refresh(inPlace = false) {
    if (inFlight) return;
    inFlight = true;
    if (!inPlace) {
      this.setData({ loading: true, items: [], nextCursor: null });
    }
    const enter = !animatedOnce;
    try {
      const res = await collectionsService.list({
        limit: 20,
        ...this.data.filter,
        title: this.data.activeTitle || undefined,
      });
      animatedOnce = true;
      lastLoadedVersion = getContentVersion();
      this.setData({
        items: toRowViews(res.items),
        nextCursor: res.nextCursor,
        enterAnim: enter,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      inFlight = false;
      if (!inPlace) this.setData({ loading: false });
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
        // Appended rows shouldn't re-trigger the entrance stagger.
        enterAnim: false,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  /** Toggle the date/location filter panel open/closed (筛选 button + caret). */
  onToggleFilters() {
    this.setData({ filtersOpen: !this.data.filtersOpen });
  },

  /** Focusing the inline search reveals the date/location filters too. */
  onSearchFocus() {
    if (!this.data.filtersOpen) this.setData({ filtersOpen: true });
  },

  /**
   * Recompute the collapsed-bar summary (active date label + whether any
   * filter/search is applied) from this.data.filter + activeTitle.
   */
  updateFilterSummary() {
    const summaryDate = dateSummaryLabel(this.data.filter);
    const hasActiveFilters = !!(
      summaryDate ||
      this.data.filter.location ||
      this.data.activeTitle
    );
    this.setData({ summaryDate, hasActiveFilters });
  },

  onFilterChange(e: WechatMiniprogram.CustomEvent<FilterChange>) {
    this.setData({ filter: e.detail });
    this.updateFilterSummary();
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
    this.updateFilterSummary();
    void this.refresh();
  },

  onSearchClear() {
    searchDebounce?.cancel();
    this.setData({ searchInput: '', activeTitle: '' });
    this.updateFilterSummary();
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

  async onFabTap() {
    if (!(await ensureCanUpload())) return;
    wx.navigateTo({ url: '/pkgUpload/new/index' });
  },

  onShareTimeline() {
    return {
      title: '慢慢记 · 时光轴',
      query: '',
    };
  },
});
