import { wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';
import type { UserDTO } from '@daynest/shared';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

interface SessionResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

/** Generate a friendly default username like `nest_a1b2c3` (matches USERNAME_RE). */
function generateUsername(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `nest_${suffix}`;
}

Page({
  data: {
    theme: '' as '' | 'dark',
    bindToken: '',
    // Auto-generated, editable login name. WeChat accounts sign in via WeChat,
    // so there's no password — this is just a stable handle.
    username: '',
    // Display name, pre-filled from the WeChat nickname (type="nickname" input).
    displayName: '',
    // Optional: an invite unlocks posting photos. Empty → view-only account.
    inviteToken: '',
    canSubmit: false,
    loading: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    applyTheme(this);
    const bindToken = decodeURIComponent(query.bindToken ?? '');
    if (!bindToken) {
      this.setData({ error: '缺少绑定令牌，请回登录页重试。' });
      return;
    }
    const username = generateUsername();
    this.setData({ bindToken, username });
    this.recomputeCanSubmit({ username });
  },

  onUnload() {
    disposeTheme(this);
  },

  onUsername(e: WechatMiniprogram.Input) {
    const username = e.detail.value;
    this.setData({ username });
    this.recomputeCanSubmit({ username });
  },
  onDisplayName(e: WechatMiniprogram.Input) {
    const displayName = e.detail.value;
    this.setData({ displayName });
    this.recomputeCanSubmit({ displayName });
  },
  onInviteToken(e: WechatMiniprogram.Input) {
    const inviteToken = e.detail.value;
    this.setData({ inviteToken });
    this.recomputeCanSubmit({ inviteToken });
  },

  recomputeCanSubmit(partial: Partial<{
    username: string;
    displayName: string;
    inviteToken: string;
  }>) {
    const m = { ...this.data, ...partial };
    const invite = m.inviteToken.trim();
    const canSubmit =
      USERNAME_RE.test(m.username.trim()) &&
      m.displayName.trim().length >= 1 &&
      // Invite is optional, but if supplied it must look long enough to be real.
      (invite.length === 0 || invite.length >= 8);
    this.setData({ canSubmit });
  },

  async onSubmit() {
    if (this.data.loading || !this.data.canSubmit) return;
    this.setData({ loading: true, error: '' });
    try {
      const invite = this.data.inviteToken.trim();
      const res = await api.request<SessionResponse>({
        url: endpoints.wechatRegister(),
        method: 'POST',
        data: {
          bindToken: this.data.bindToken,
          username: this.data.username.trim(),
          displayName: this.data.displayName.trim(),
          ...(invite ? { inviteToken: invite } : {}),
        },
      });
      if (res.statusCode !== 200) {
        const body = res.data as { error?: { code?: string; message?: string } };
        const code = body.error?.code ?? '';
        const message =
          code === 'INVALID_INVITE' ? '邀请码无效'
          : code === 'INVITE_EXPIRED' ? '邀请码已过期'
          : code === 'INVITE_ALREADY_USED' ? '邀请码已被使用'
          : code === 'USERNAME_TAKEN' ? '登录名已被占用，换一个试试'
          : code === 'WECHAT_ALREADY_BOUND' ? '此微信已绑定其他账号'
          : code === 'BIND_TOKEN_INVALID' ? '登录已超时，请回登录页重试'
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
