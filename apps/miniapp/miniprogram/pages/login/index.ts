import { wxLogin, wxShowToast } from '../../lib/wxBridge.js';
import { createApiClient } from '../../lib/api.js';
import { endpoints } from '../../lib/endpoints.js';
import { authStore } from '../../stores/authStore.js';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

interface LoginBoundResponse {
  status: 'bound';
  user: { id: string; username: string; displayName: string; avatarKey: string | null; hasWechatBound: boolean };
  accessToken: string;
  refreshToken: string;
}
interface LoginUnboundResponse {
  status: 'unbound';
  bindToken: string;
}
type LoginResponse = LoginBoundResponse | LoginUnboundResponse;

Page({
  data: { loading: false, error: '' },

  async onWechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      const code = await wxLogin();
      const res = await api.request<LoginResponse>({
        url: endpoints.wechatLogin(),
        method: 'POST',
        data: { code },
      });
      if (res.statusCode !== 200) {
        const err = (res.data as { error?: { message?: string } })?.error?.message ?? '登录失败';
        this.setData({ loading: false, error: err });
        return;
      }
      if (res.data.status === 'bound') {
        authStore.setSession({
          user: res.data.user,
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
        });
        wxShowToast('欢迎回来', 'success');
        wx.switchTab({ url: '/pages/timeline/index' });
      } else {
        wx.navigateTo({
          url: `/pages/bind/index?bindToken=${encodeURIComponent(res.data.bindToken)}`,
        });
        this.setData({ loading: false });
      }
    } catch (e) {
      this.setData({
        loading: false,
        error: e instanceof Error ? e.message : '网络异常',
      });
    }
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pkgOnboarding/register/index' });
  },
});
