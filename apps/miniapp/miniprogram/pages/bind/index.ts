import { wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';
import type { UserDTO } from '@daynest/shared';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

interface BindResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

Page({
  data: {
    bindToken: '',
    username: '',
    password: '',
    canSubmit: false,
    loading: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const bindToken = decodeURIComponent(query.bindToken ?? '');
    if (!bindToken) {
      this.setData({ error: '缺少绑定令牌，请回登录页重试。' });
      return;
    }
    this.setData({ bindToken });
  },

  onUsername(e: WechatMiniprogram.Input) {
    this.setData({
      username: e.detail.value,
      canSubmit: this.computeCanSubmit(e.detail.value, this.data.password),
    });
  },
  onPassword(e: WechatMiniprogram.Input) {
    this.setData({
      password: e.detail.value,
      canSubmit: this.computeCanSubmit(this.data.username, e.detail.value),
    });
  },
  computeCanSubmit(u: string, p: string): boolean {
    return u.length >= 1 && p.length >= 8;
  },

  async onSubmit() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    const res = await api.request<BindResponse>({
      url: endpoints.wechatBind(),
      method: 'POST',
      data: {
        bindToken: this.data.bindToken,
        username: this.data.username,
        password: this.data.password,
      },
    });
    if (res.statusCode !== 200) {
      const body = res.data as { error?: { code?: string; message?: string } };
      const code = body.error?.code ?? '';
      const message =
        code === 'CREDENTIALS_INVALID' ? '登录名或密码不正确'
        : code === 'USER_ALREADY_BOUND' ? '此账号已绑定其他微信'
        : code === 'WECHAT_ALREADY_BOUND' ? '此微信已绑定其他账号'
        : code === 'BIND_TOKEN_INVALID' ? '绑定令牌已失效，请回登录页重试'
        : body.error?.message ?? '绑定失败';
      this.setData({ loading: false, error: message });
      return;
    }
    authStore.setSession({
      user: res.data.user,
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken,
    });
    wxShowToast('绑定成功', 'success');
    wx.switchTab({ url: '/pages/timeline/index' });
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pkgOnboarding/register/index' });
  },
});
