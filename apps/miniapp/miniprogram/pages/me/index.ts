import type { UserDTO } from '@daynest/shared';
import { authStore } from '../../stores/authStore.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';
import { consumeTabSlide } from '../../lib/tabTransition.js';

const api = createApiClient({
  tokens: authStore,
  refreshUrl: endpoints.refreshToken(),
});

// Gate the card entrance animation to the first show; clear the slide class
// after the one-shot tab transition.
let animatedOnce = false;
let slideTimer: ReturnType<typeof setTimeout> | null = null;

Page({
  data: {
    theme: '' as '' | 'dark',
    user: null as UserDTO | null,
    editing: false,
    draftDisplay: '',
    saving: false,
    notice: '',
    noticeKind: '' as 'ok' | 'err' | '',
    slide: '' as '' | 'slide-in-right' | 'slide-in-left',
    enterAnim: true,
  },

  onShow() {
    applyTheme(this);
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tb) tb.setData({ active: 3 });
    this.playTabSlide();

    const enter = !animatedOnce;
    animatedOnce = true;
    const user = authStore.getState().user;
    this.setData({
      user,
      draftDisplay: user?.displayName ?? '',
      enterAnim: enter,
    });
  },

  onUnload() {
    disposeTheme(this);
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
