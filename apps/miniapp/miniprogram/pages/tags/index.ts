import type { TagDTO } from '@daynest/shared';
import { tagsService } from '../../lib/services/tags.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';
import { consumeTabSlide } from '../../lib/tabTransition.js';
import { getContentVersion } from '../../lib/contentVersion.js';
import { enableShareMenu } from '../../lib/shareMenu.js';

// See pages/timeline — skip the redundant refresh on first mount, re-pull on
// every subsequent return to the tab.
let hasShown = false;
let inFlight = false;
let animatedOnce = false;
let slideTimer: ReturnType<typeof setTimeout> | null = null;
// Content version captured on the last successful list load — see pages/timeline.
let lastLoadedVersion = -1;

Page({
  data: {
    theme: '' as '' | 'dark',
    tags: [] as TagDTO[],
    popular: [] as TagDTO[],
    collectionTags: [] as TagDTO[],
    photoOnlyTags: [] as TagDTO[],
    loading: false,
    slide: '' as '' | 'slide-in-right' | 'slide-in-left',
    enterAnim: true,
  },

  onShow() {
    enableShareMenu();
    applyTheme(this);
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 2 });
    this.playTabSlide();
    if (!hasShown) {
      hasShown = true;
      if (this.data.tags.length === 0 && !inFlight) void this.refresh();
    } else if (this.data.tags.length === 0 || getContentVersion() !== lastLoadedVersion) {
      // Only re-pull when content changed since the last load. In-place refresh
      // keeps tags visible; when unchanged we skip the network call entirely.
      void this.refresh(true);
    }
  },

  onUnload() {
    disposeTheme(this);
    hasShown = false;
    animatedOnce = false;
    if (slideTimer !== null) {
      clearTimeout(slideTimer);
      slideTimer = null;
    }
  },

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

  async refresh(inPlace = false) {
    if (inFlight) return;
    inFlight = true;
    // Only show the loading state on a fresh load; an in-place refresh keeps
    // the existing tags visible until the new data arrives.
    if (!inPlace) this.setData({ loading: true });
    const enter = !animatedOnce;
    try {
      const tags = await tagsService.list();
      const popular = [...tags]
        .sort((a, b) => ((b.photoCount ?? 0) + (b.collectionCount ?? 0)) - ((a.photoCount ?? 0) + (a.collectionCount ?? 0)))
        .slice(0, 6);
      const collectionTags = tags.filter((t) => (t.collectionCount ?? 0) > 0);
      const photoOnlyTags = tags.filter((t) => (t.collectionCount ?? 0) === 0 && (t.photoCount ?? 0) > 0);
      animatedOnce = true;
      lastLoadedVersion = getContentVersion();
      this.setData({ tags, popular, collectionTags, photoOnlyTags, enterAnim: enter });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      inFlight = false;
      if (!inPlace) this.setData({ loading: false });
    }
  },

  onTagTap(e: WechatMiniprogram.TouchEvent) {
    const name = e.currentTarget.dataset.name as string;
    const scope = (e.currentTarget.dataset.scope as string) || 'all';
    if (!name) return;
    const tag = this.data.tags.find((t) => t.name === name);
    const display = tag?.displayName ?? name;
    wx.navigateTo({
      url: `/pkgTags/pinboard/index?tag=${encodeURIComponent(name)}&display=${encodeURIComponent(display)}&scope=${encodeURIComponent(scope)}`,
    });
  },

  onShareTimeline() {
    return {
      title: '慢慢记 · 标签',
      query: '',
    };
  },
});
