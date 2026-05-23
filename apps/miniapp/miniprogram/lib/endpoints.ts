import { resolveApiBase } from './config.js';

export const endpoints = {
  wechatLogin: () => `${resolveApiBase()}/api/auth/wechat-login`,
  wechatBind: () => `${resolveApiBase()}/api/auth/wechat-bind`,
  wechatRegister: () => `${resolveApiBase()}/api/auth/wechat-register`,
  wechatUnbind: () => `${resolveApiBase()}/api/auth/wechat-unbind`,
  refreshToken: () => `${resolveApiBase()}/api/auth/refresh-token`,
  me: () => `${resolveApiBase()}/api/auth/me`,
  subscribe: () => `${resolveApiBase()}/api/wechat/subscribe`,
};
