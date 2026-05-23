import { authStore } from './stores/authStore.js';
import { themeStore } from './stores/themeStore.js';

App({
  onLaunch() {
    authStore.hydrate();
    themeStore.hydrate();
    wx.onThemeChange?.(() => themeStore.refresh());
  },
  onShow() {},
});
