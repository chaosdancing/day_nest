import type { UserDTO } from '@daynest/shared';
import { createApiClient } from './api.js';
import { endpoints } from './endpoints.js';
import { authStore } from '../stores/authStore.js';

const api = createApiClient({ tokens: authStore, refreshUrl: endpoints.refreshToken() });

/**
 * Gate for "post photos" actions. View-only WeChat accounts (registered without
 * an invite) have `canUpload === false`; everyone else may upload. When blocked
 * we offer an inline invite prompt and, on a successful redeem, flip the account
 * to an uploader (updating the auth store) so the original action can proceed.
 *
 * Returns true when the caller may continue to the upload flow.
 *
 * NOTE: the server enforces this independently — this is purely UX so viewers
 * get a friendly prompt instead of a 403 after composing an upload.
 */
export async function ensureCanUpload(): Promise<boolean> {
  const user = authStore.getState().user;
  // Treat a missing flag (older persisted session) as allowed; the server is
  // the source of truth and will 403 if it's actually a viewer.
  if (!user || user.canUpload !== false) return true;

  const modal = await new Promise<WechatMiniprogram.ShowModalSuccessCallbackResult | null>(
    (resolve) => {
      wx.showModal({
        title: '发照片需要邀请码',
        editable: true,
        placeholderText: '粘贴家人发给你的邀请码',
        confirmText: '解锁',
        cancelText: '再逛逛',
        success: resolve,
        fail: () => resolve(null),
      });
    },
  );
  if (!modal || !modal.confirm) return false;

  const token = (modal.content ?? '').trim();
  if (token.length < 8) {
    wx.showToast({ title: '邀请码不正确', icon: 'none' });
    return false;
  }

  wx.showLoading({ title: '解锁中…', mask: true });
  try {
    const res = await api.request<{ user: UserDTO }>({
      url: endpoints.redeemInvite(),
      method: 'POST',
      data: { inviteToken: token },
    });
    wx.hideLoading();
    if (res.statusCode !== 200) {
      const body = res.data as { error?: { code?: string; message?: string } };
      const code = body.error?.code ?? '';
      const message =
        code === 'INVALID_INVITE' ? '邀请码无效'
        : code === 'INVITE_EXPIRED' ? '邀请码已过期'
        : code === 'INVITE_ALREADY_USED' ? '邀请码已被使用'
        : body.error?.message ?? '解锁失败';
      wx.showToast({ title: message, icon: 'none' });
      return false;
    }
    authStore.setUser(res.data.user);
    wx.showToast({ title: '已解锁发照片', icon: 'success' });
    return true;
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: e instanceof Error ? e.message.slice(0, 20) : '网络异常', icon: 'none' });
    return false;
  }
}
