/**
 * Dev-only username/password login. Bypasses wx.login so DevTools sessions
 * with `touristappid` (which cannot mint real WeChat codes) can still
 * exercise the rest of the app. The entry on /pages/login/index is only
 * rendered when `envVersion === 'develop' || 'trial'`.
 */
import { wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

/**
 * `/api/auth/login` returns `{ user, accessToken }` and sets the refresh
 * token as an HttpOnly cookie scoped to `/api/auth`. The mini-app cannot
 * forward path-scoped cookies between requests, so we deliberately leave
 * `refreshToken` empty here — when the access token expires the user
 * just dev-logs in again. This is fine because the entry is only meant
 * for DevTools / 体验版 testing.
 */
interface LoginResponse {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarKey: string | null;
    hasWechatBound: boolean;
  };
  accessToken: string;
}

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    error: '',
    canSubmit: false,
  },

  onUsername(e: WechatMiniprogram.Input) {
    const username = e.detail.value;
    this.setData({
      username,
      canSubmit: username.trim().length > 0 && this.data.password.length > 0,
    });
  },

  onPassword(e: WechatMiniprogram.Input) {
    const password = e.detail.value;
    this.setData({
      password,
      canSubmit: this.data.username.trim().length > 0 && password.length > 0,
    });
  },

  async onSubmit() {
    if (!this.data.canSubmit || this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const res = await api.request<LoginResponse>({
        url: endpoints.login(),
        method: 'POST',
        data: {
          username: this.data.username.trim(),
          password: this.data.password,
        },
      });
      if (res.statusCode !== 200) {
        const err =
          (res.data as { error?: { message?: string } })?.error?.message ?? '登录失败';
        this.setData({ loading: false, error: err });
        return;
      }
      authStore.setSession({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: '',
      });
      wxShowToast('登录成功', 'success');
      wx.switchTab({ url: '/pages/timeline/index' });
    } catch (e) {
      this.setData({
        loading: false,
        error: e instanceof Error ? e.message : '网络异常',
      });
    }
  },
});
