/**
 * Runtime config for the mini-program.
 *
 * `apiBase` MUST be configured in the WeChat 公众平台 "request 合法域名" list
 * before release. For local DevTools development, set "不校验合法域名" in
 * the project settings and point apiBase at http://localhost:3000.
 */
export const config = {
  apiBase: 'https://daynest.top',
  /** Local development override — only effective in WeChat DevTools. */
  apiBaseDev: 'http://localhost:3000',
} as const;

export function resolveApiBase(): string {
  try {
    const env = wx.getAccountInfoSync?.()?.miniProgram?.envVersion;
    if (env === 'develop' || env === 'trial') return config.apiBaseDev;
  } catch {
    // older WeChat clients without getAccountInfoSync — fall through
  }
  return config.apiBase;
}
