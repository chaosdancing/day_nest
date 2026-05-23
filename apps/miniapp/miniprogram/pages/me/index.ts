import { authStore } from '../../stores/authStore.js';

Page({
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 3 });
    }
  },
  onLogout() {
    authStore.logout();
    wx.reLaunch({ url: '/pages/login/index' });
  },
});
