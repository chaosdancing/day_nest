/**
 * WeChat mini-program API response/request types.
 *
 * Only the subset of fields used by our routes is modeled.
 * Full WeChat API: https://developers.weixin.qq.com/miniprogram/dev/api-backend/
 */

export type JsCode2SessionResult = {
  openid: string;
  sessionKey: string;
  unionid?: string;
};

export type AccessTokenResult = {
  accessToken: string;
  /** Wall-clock UNIX timestamp (seconds) when the token expires. */
  expiresAt: number;
};

export type SubscribeMessageInput = {
  /** Recipient WeChat openid. */
  toUser: string;
  /** Subscribe-message template id (issued by WX admin console). */
  templateId: string;
  /**
   * Optional deep-link path inside the mini-app, eg `pages/photo/index?id=...`.
   * If omitted, tapping the notification opens the mini-app home.
   */
  page?: string;
  /**
   * Template-specific data, key → { value }. WX requires this shape.
   * Keys depend on the template; the server is responsible for matching.
   */
  data: Record<string, { value: string }>;
};

/** Best-effort outcome of sendSubscribeMessage; the server treats it fire-and-forget. */
export type SubscribeMessageOutcome =
  | { ok: true }
  | { ok: false; errcode: number; errmsg: string };
