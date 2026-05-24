import type {
  JsCode2SessionResult,
  AccessTokenResult,
  SubscribeMessageInput,
  SubscribeMessageOutcome,
} from './types.js';

/**
 * Minimal contract for the small subset of WeChat APIs we use.
 *
 * Real impl: `RealWechatClient` (Task 7) — calls api.weixin.qq.com.
 * Test impl: `FakeWechatClient` (tests/helpers) — controllable responses.
 * Disabled:  `DisabledWechatClient` (below) — throws on every call.
 */
export interface WechatClient {
  jsCode2Session(code: string): Promise<JsCode2SessionResult>;
  getAccessToken(): Promise<AccessTokenResult>;
  sendSubscribeMessage(input: SubscribeMessageInput): Promise<SubscribeMessageOutcome>;
}

/**
 * Thrown by WechatClient implementations when WeChat's API responds with a
 * non-zero `errcode`. Routes catch this to map WX errcodes (eg 40029 "invalid
 * code") to HTTP responses without string-matching error messages.
 */
export class WechatApiError extends Error {
  readonly errcode: number;
  readonly errmsg: string;
  constructor(errcode: number, errmsg: string) {
    super(`wechat api error ${errcode}: ${errmsg}`);
    this.name = 'WechatApiError';
    this.errcode = errcode;
    this.errmsg = errmsg;
  }
}

/**
 * Used when `config.wechat.enabled` is false. Every method throws — routes
 * are expected to gate on `config.wechat.enabled` and return WECHAT_DISABLED
 * before reaching the client, so this class exists mostly to make
 * AppDeps.wechat non-nullable.
 */
export class DisabledWechatClient implements WechatClient {
  async jsCode2Session(): Promise<JsCode2SessionResult> {
    throw new Error('wechat client is disabled (WECHAT_APPID/WECHAT_APP_SECRET unset)');
  }
  async getAccessToken(): Promise<AccessTokenResult> {
    throw new Error('wechat client is disabled (WECHAT_APPID/WECHAT_APP_SECRET unset)');
  }
  async sendSubscribeMessage(): Promise<SubscribeMessageOutcome> {
    throw new Error('wechat client is disabled (WECHAT_APPID/WECHAT_APP_SECRET unset)');
  }
}
