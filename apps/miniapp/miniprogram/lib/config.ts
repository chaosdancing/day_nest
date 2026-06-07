/**
 * Runtime config for the mini-program.
 *
 * `apiBase` MUST be configured in the WeChat 公众平台 "request 合法域名" list
 * before release. For local DevTools development, set "不校验合法域名" in
 * the project settings — the dev override below uses the dev machine's
 * LAN IP so BOTH the DevTools simulator AND a real phone scanning the
 * preview QR can hit it (phone obviously can't resolve localhost).
 *
 * If your LAN IP changes (different WiFi / hotspot), update apiBaseDev
 * to the new `ipconfig getifaddr en0` value.
 */
export const config = {
  apiBase: 'https://daynest.top',
  /** Local development override — only effective in WeChat DevTools. */
  apiBaseDev: 'http://192.168.3.94:3000',
} as const;

export function resolveApiBase(): string {
  // 体验版('trial') and 正式版('release') must hit production so testers and
  // reviewers scanning the trial QR reach a real backend. Only DevTools
  // (envVersion 'develop', or undefined for touristappid) uses the local
  // dev API.
  let env: string | undefined;
  try {
    env = wx.getAccountInfoSync?.()?.miniProgram?.envVersion;
  } catch {
    env = undefined;
  }
  return env === 'trial' || env === 'release' ? config.apiBase : config.apiBaseDev;
}
