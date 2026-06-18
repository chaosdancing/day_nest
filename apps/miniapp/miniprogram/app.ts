import { authStore } from './stores/authStore.js';
import { themeStore } from './stores/themeStore.js';
import {
  DEFAULT_SHARE_PATH,
  DEFAULT_SHARE_TITLE,
  enableShareMenu,
} from './lib/shareMenu.js';

App({
  onLaunch() {
    authStore.hydrate();
    themeStore.hydrate();
    wx.onThemeChange?.(() => themeStore.refresh());
    enableShareMenu();
  },

  /** Fallback when a page does not define its own `onShareAppMessage`. */
  onShareAppMessage() {
    return {
      title: DEFAULT_SHARE_TITLE,
      path: DEFAULT_SHARE_PATH,
    };
  },
});
