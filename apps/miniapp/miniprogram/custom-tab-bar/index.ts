Component({
  data: {
    active: 0,
    list: [
      { pagePath: '/pages/timeline/index', text: '时光轴', icon: '📖' },
      { pagePath: '/pages/favorites/index', text: '最爱', icon: '❤️' },
      { pagePath: '/pages/tags/index', text: '标签', icon: '🏷' },
      { pagePath: '/pages/me/index', text: '我的', icon: '👤' },
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
