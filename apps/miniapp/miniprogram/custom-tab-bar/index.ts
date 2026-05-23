Component({
  data: {
    active: 0,
    list: [
      { pagePath: '/pages/timeline/index', text: '时间轴' },
      { pagePath: '/pages/favorites/index', text: '收藏' },
      { pagePath: '/pages/tags/index', text: '标签' },
      { pagePath: '/pages/me/index', text: '我的' },
    ],
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const idx = Number(e.currentTarget.dataset.idx);
      const target = this.data.list[idx];
      if (!target) return;
      this.setData({ active: idx });
      wx.switchTab({ url: target.pagePath });
    },
  },
});
