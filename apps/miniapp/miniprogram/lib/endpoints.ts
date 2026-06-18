import { resolveApiBase } from './config.js';

export const endpoints = {
  wechatLogin: () => `${resolveApiBase()}/api/auth/wechat-login`,
  wechatBind: () => `${resolveApiBase()}/api/auth/wechat-bind`,
  wechatRegister: () => `${resolveApiBase()}/api/auth/wechat-register`,
  redeemInvite: () => `${resolveApiBase()}/api/auth/redeem-invite`,
  usernameAvailable: (username: string) =>
    `${resolveApiBase()}/api/auth/username-available?username=${encodeURIComponent(username)}`,
  wechatUnbind: () => `${resolveApiBase()}/api/auth/wechat-unbind`,
  refreshToken: () => `${resolveApiBase()}/api/auth/refresh-token`,
  me: () => `${resolveApiBase()}/api/auth/me`,
  createInvite: () => `${resolveApiBase()}/api/invites`,
  subscribe: () => `${resolveApiBase()}/api/wechat/subscribe`,
  /** Username/password login. Dev-only entry from /pages/dev-login/index. */
  login: () => `${resolveApiBase()}/api/auth/login`,
};
