import {
  WechatApiError,
  type WechatClient,
} from './client.js';
import type { AccessTokenCache } from './accessTokenCache.js';
import type {
  JsCode2SessionResult,
  AccessTokenResult,
  SubscribeMessageInput,
  SubscribeMessageOutcome,
} from './types.js';

const WECHAT_API_BASE = 'https://api.weixin.qq.com';

export type RealWechatClientOptions = {
  appId: string;
  appSecret: string;
  cache: AccessTokenCache;
  /** Override for tests. Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
};

/**
 * Production WechatClient calling api.weixin.qq.com.
 *
 * - jsCode2Session: per-call HTTP GET (no caching; the code is single-use)
 * - getAccessToken: cached via AccessTokenCache
 * - sendSubscribeMessage: per-call HTTP POST using cached access_token
 */
export class RealWechatClient implements WechatClient {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly cache: AccessTokenCache;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(opts: RealWechatClientOptions) {
    this.appId = opts.appId;
    this.appSecret = opts.appSecret;
    this.cache = opts.cache;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  async jsCode2Session(code: string): Promise<JsCode2SessionResult> {
    const url =
      `${WECHAT_API_BASE}/sns/jscode2session` +
      `?appid=${encodeURIComponent(this.appId)}` +
      `&secret=${encodeURIComponent(this.appSecret)}` +
      `&js_code=${encodeURIComponent(code)}` +
      `&grant_type=authorization_code`;

    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(`jscode2session http ${res.status}`);
    }
    const body = (await res.json()) as {
      openid?: string;
      session_key?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (typeof body.errcode === 'number' && body.errcode !== 0) {
      throw new WechatApiError(body.errcode, body.errmsg ?? 'unknown');
    }
    if (!body.openid || !body.session_key) {
      throw new Error('jscode2session: missing fields');
    }
    return {
      openid: body.openid,
      sessionKey: body.session_key,
      ...(body.unionid ? { unionid: body.unionid } : {}),
    };
  }

  async getAccessToken(): Promise<AccessTokenResult> {
    return this.cache.get(async () => {
      const url =
        `${WECHAT_API_BASE}/cgi-bin/token` +
        `?grant_type=client_credential` +
        `&appid=${encodeURIComponent(this.appId)}` +
        `&secret=${encodeURIComponent(this.appSecret)}`;
      const res = await this.fetchImpl(url);
      if (!res.ok) {
        throw new Error(`cgi-bin/token http ${res.status}`);
      }
      const body = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
        errcode?: number;
        errmsg?: string;
      };
      if (typeof body.errcode === 'number' && body.errcode !== 0) {
        throw new WechatApiError(body.errcode, body.errmsg ?? 'unknown');
      }
      if (!body.access_token || typeof body.expires_in !== 'number') {
        throw new Error('cgi-bin/token: missing fields');
      }
      return {
        accessToken: body.access_token,
        expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
      };
    });
  }

  async sendSubscribeMessage(
    input: SubscribeMessageInput,
  ): Promise<SubscribeMessageOutcome> {
    const { accessToken } = await this.getAccessToken();
    const url =
      `${WECHAT_API_BASE}/cgi-bin/message/subscribe/send` +
      `?access_token=${encodeURIComponent(accessToken)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: input.toUser,
        template_id: input.templateId,
        ...(input.page ? { page: input.page } : {}),
        data: input.data,
      }),
    });
    if (!res.ok) {
      throw new Error(`subscribe/send http ${res.status}`);
    }
    const body = (await res.json()) as { errcode?: number; errmsg?: string };
    if (body.errcode === 0) return { ok: true };
    return {
      ok: false,
      errcode: body.errcode ?? -1,
      errmsg: body.errmsg ?? 'unknown',
    };
  }
}
