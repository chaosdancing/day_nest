import type { UserDTO } from '@daynest/shared';
import { authStore } from '../../stores/authStore.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { config } from '../../lib/config.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';
import { consumeTabSlide } from '../../lib/tabTransition.js';
import { enableShareMenu } from '../../lib/shareMenu.js';

/** Web origin that serves the invite-aware /register page (production host,
 *  shared regardless of the mini-app env so the link works when opened). */
const WEB_ORIGIN = config.apiBase;

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day} ${hh}:${mm}`;
}

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
    // Invite (only shown for upload-capable users).
    inviteBusy: false,
    inviteToken: '',
    inviteLink: '',
    inviteExpiresLabel: '',
  },

  onShow() {
    enableShareMenu();
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
          (res.data as { message?: string })?.message ?? '保存失败';
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

  /** Mint a one-time invite. Only reachable when the user can upload (the
   *  section is gated in WXML and the API enforces requireUploader too). */
  async onGenerateInvite() {
    if (this.data.inviteBusy) return;
    this.setData({ inviteBusy: true });
    try {
      const res = await api.request<{ token: string; expiresAt: string }>({
        url: endpoints.createInvite(),
        method: 'POST',
        data: {},
      });
      if (res.statusCode === 200 && res.data?.token) {
        const token = res.data.token;
        this.setData({
          inviteToken: token,
          inviteLink: `${WEB_ORIGIN}/register?token=${encodeURIComponent(token)}`,
          inviteExpiresLabel: formatExpiry(res.data.expiresAt),
        });
        wx.showToast({ title: '邀请已生成', icon: 'success' });
      } else {
        const msg = (res.data as { message?: string })?.message ?? '生成失败';
        wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: e instanceof Error ? e.message.slice(0, 30) : '网络异常', icon: 'none' });
    } finally {
      this.setData({ inviteBusy: false });
    }
  },

  onCopyInviteCode() {
    if (!this.data.inviteToken) return;
    wx.setClipboardData({
      data: this.data.inviteToken,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    });
  },

  onCopyInviteLink() {
    if (!this.data.inviteLink) return;
    wx.setClipboardData({
      data: this.data.inviteLink,
      success: () => wx.showToast({ title: '邀请链接已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    });
  },

  onShareTimeline() {
    return {
      title: '慢慢记 · 我的',
      query: '',
    };
  },

  /** Inline toast-ish — flashes a tinted line under the relevant section. */
  flashNotice(kind: 'ok' | 'err', message: string) {
    this.setData({ notice: message, noticeKind: kind });
    setTimeout(() => {
      this.setData({ notice: '', noticeKind: '' });
    }, 2400);
  },
});
