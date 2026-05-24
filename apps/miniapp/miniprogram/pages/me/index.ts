import type { UserDTO, ThemeMode } from '@daynest/shared';
import { authStore } from '../../stores/authStore.js';
import { themeStore } from '../../stores/themeStore.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';

const api = createApiClient({
  tokens: authStore,
  refreshUrl: endpoints.refreshToken(),
});

interface ThemeOption {
  key: ThemeMode;
  label: string;
  emoji: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { key: 'system', label: '跟随系统', emoji: '⚙️' },
  { key: 'light', label: '日间', emoji: '🌞' },
  { key: 'dark', label: '夜间', emoji: '🌙' },
];

Page({
  data: {
    user: null as UserDTO | null,
    themeOptions: THEME_OPTIONS,
    themeMode: 'system' as ThemeMode,
    editing: false,
    draftDisplay: '',
    saving: false,
    notice: '',
    noticeKind: '' as 'ok' | 'err' | '',
  },

  onShow() {
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 3 });

    const user = authStore.getState().user;
    const themeMode = themeStore.getState().mode;
    this.setData({
      user,
      themeMode,
      draftDisplay: user?.displayName ?? '',
    });
  },

  /** Toggle inline edit on displayName. Tapping the value again commits. */
  onStartEditDisplay() {
    if (!this.data.user) return;
    this.setData({ editing: true, draftDisplay: this.data.user.displayName });
  },
  onCancelEditDisplay() {
    this.setData({ editing: false, draftDisplay: this.data.user?.displayName ?? '' });
  },
  onDraftInput(e: WechatMiniprogram.Input) {
    this.setData({ draftDisplay: e.detail.value });
  },
  async onCommitDisplay() {
    if (this.data.saving || !this.data.user) return;
    const next = this.data.draftDisplay.trim();
    if (next.length === 0 || next === this.data.user.displayName) {
      this.setData({ editing: false, draftDisplay: this.data.user.displayName });
      return;
    }
    this.setData({ saving: true });
    try {
      const res = await api.request<{ user: UserDTO }>({
        url: endpoints.me(),
        method: 'PATCH',
        data: { displayName: next },
      });
      if (res.statusCode === 200) {
        authStore.setUser(res.data.user);
        this.setData({
          user: res.data.user,
          editing: false,
          draftDisplay: res.data.user.displayName,
        });
        this.flashNotice('ok', '展示名已更新');
      } else {
        const msg =
          (res.data as { error?: { message?: string } })?.error?.message ?? '保存失败';
        this.flashNotice('err', msg);
      }
    } catch (e) {
      this.flashNotice('err', e instanceof Error ? e.message : '网络异常');
    } finally {
      this.setData({ saving: false });
    }
  },

  onPickTheme(e: WechatMiniprogram.TouchEvent) {
    const mode = e.currentTarget.dataset.mode as ThemeMode;
    themeStore.setMode(mode);
    this.setData({ themeMode: mode });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录？',
      content: '下次进来需要重新登录。',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          authStore.logout();
          wx.reLaunch({ url: '/pages/login/index' });
        }
      },
    });
  },

  /** Inline toast-ish — flashes a tinted line under the relevant section. */
  flashNotice(kind: 'ok' | 'err', message: string) {
    this.setData({ notice: message, noticeKind: kind });
    setTimeout(() => {
      this.setData({ notice: '', noticeKind: '' });
    }, 2400);
  },
});
