import { wxLogin, wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';
import type { UserDTO } from '@daynest/shared';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

interface RegisterResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

Page({
  data: {
    inviteToken: '',
    username: '',
    displayName: '',
    password: '',
    canSubmit: false,
    loading: false,
    error: '',
  },

  onInviteToken(e: WechatMiniprogram.Input) { this.update({ inviteToken: e.detail.value }); },
  onUsername(e: WechatMiniprogram.Input) { this.update({ username: e.detail.value }); },
  onDisplayName(e: WechatMiniprogram.Input) { this.update({ displayName: e.detail.value }); },
  onPassword(e: WechatMiniprogram.Input) { this.update({ password: e.detail.value }); },

  update(partial: Partial<{ inviteToken: string; username: string; displayName: string; password: string }>) {
    const merged = { ...this.data, ...partial };
    const canSubmit =
      merged.inviteToken.length >= 8 &&
      USERNAME_RE.test(merged.username) &&
      merged.displayName.length >= 1 &&
      merged.password.length >= 8;
    this.setData({ ...partial, canSubmit });
  },

  async onSubmit() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const code = await wxLogin();
      const loginRes = await api.request<{ status: string; bindToken?: string }>({
        url: endpoints.wechatLogin(),
        method: 'POST',
        data: { code },
      });
      if (loginRes.statusCode !== 200 || loginRes.data.status !== 'unbound' || !loginRes.data.bindToken) {
        this.setData({ loading: false, error: '此微信不可注册（可能已绑定）' });
        return;
      }
      const bindToken = loginRes.data.bindToken;
      const res = await api.request<RegisterResponse>({
        url: endpoints.wechatRegister(),
        method: 'POST',
        data: {
          bindToken,
          inviteToken: this.data.inviteToken,
          username: this.data.username,
          displayName: this.data.displayName,
          password: this.data.password,
        },
      });
      if (res.statusCode !== 200) {
        const body = res.data as { error?: { code?: string; message?: string } };
        const code2 = body.error?.code ?? '';
        const message =
          code2 === 'INVALID_INVITE' ? '邀请码无效'
          : code2 === 'INVITE_EXPIRED' ? '邀请码已过期'
          : code2 === 'INVITE_ALREADY_USED' ? '邀请码已被使用'
          : code2 === 'USERNAME_TAKEN' ? '登录名已被占用'
          : code2 === 'WECHAT_ALREADY_BOUND' ? '此微信已绑定其他账号'
          : code2 === 'BIND_TOKEN_INVALID' ? '请稍后重试'
          : body.error?.message ?? '注册失败';
        this.setData({ loading: false, error: message });
        return;
      }
      authStore.setSession({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      });
      wxShowToast('欢迎加入慢慢记', 'success');
      wx.switchTab({ url: '/pages/timeline/index' });
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '网络异常' });
    }
  },
});
