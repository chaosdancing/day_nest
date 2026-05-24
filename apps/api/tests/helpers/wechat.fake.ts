import {
  WechatApiError,
  type WechatClient,
} from '../../src/wechat/client.js';
import type {
  JsCode2SessionResult,
  AccessTokenResult,
  SubscribeMessageInput,
  SubscribeMessageOutcome,
} from '../../src/wechat/types.js';

/**
 * In-memory WechatClient for tests. Every method's response is
 * configurable; sent subscribe messages are captured in `sent`
 * for assertions.
 *
 * Usage in a test:
 *
 *   const wechat = new FakeWechatClient();
 *   wechat.codeToOpenid.set('valid-code', 'openid-xyz');
 *   const app = await buildApp({ wechat });
 *   ...
 *   expect(wechat.sent).toEqual([{ ... }]);
 */
export class FakeWechatClient implements WechatClient {
  /** code → openid for the `jsCode2Session` map. Unmapped code rejects. */
  codeToOpenid = new Map<string, string>();
  /** code → optional unionid; merged into the jsCode2Session result. */
  codeToUnionid = new Map<string, string>();
  /** Captured outgoing subscribe messages. */
  sent: SubscribeMessageInput[] = [];
  /**
   * If set, every sendSubscribeMessage returns this outcome.
   * Defaults to `{ ok: true }`.
   */
  sendOutcome: SubscribeMessageOutcome = { ok: true };

  async jsCode2Session(code: string): Promise<JsCode2SessionResult> {
    const openid = this.codeToOpenid.get(code);
    if (!openid) {
      throw new WechatApiError(40029, `fake-wechat: unknown code '${code}'`);
    }
    const unionid = this.codeToUnionid.get(code);
    return {
      openid,
      sessionKey: 'fake-session-key',
      ...(unionid ? { unionid } : {}),
    };
  }

  async getAccessToken(): Promise<AccessTokenResult> {
    return {
      accessToken: 'fake-access-token',
      expiresAt: Math.floor(Date.now() / 1000) + 7200,
    };
  }

  async sendSubscribeMessage(
    input: SubscribeMessageInput,
  ): Promise<SubscribeMessageOutcome> {
    this.sent.push(input);
    return this.sendOutcome;
  }

  /** Helper to set up a code mapping in one call. */
  setCode(code: string, openid: string, unionid?: string): this {
    this.codeToOpenid.set(code, openid);
    if (unionid) this.codeToUnionid.set(code, unionid);
    return this;
  }
}
