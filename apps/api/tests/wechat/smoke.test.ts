import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { FakeWechatClient } from '../helpers/wechat.fake.js';
import { createInvite } from '../../src/services/invites.js';
import { hashPassword } from '../../src/auth/password.js';
import { WECHAT_TEMPLATES } from '@daynest/shared';

describe('WeChat mini-app auth — end-to-end smoke', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let wechat: FakeWechatClient;

  beforeEach(async () => {
    wechat = new FakeWechatClient();
    ctx = await buildApp({ wechat });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('walks the full lifecycle: login(unbound) → register → me → refresh → subscribe → login(bound) → unbind → login(unbound again)', async () => {
    // -- Seed an inviter + invite ----------------------------------------
    const inviter = await ctx.prisma.user.create({
      data: {
        username: 'inviter',
        displayName: 'Inviter',
        passwordHash: await hashPassword('inviterpw123'),
      },
    });
    const invite = await createInvite(ctx.prisma, inviter.id, 24);

    // Map a wechat code to a fresh openid that has no daynest binding yet
    wechat.setCode('wx-code-1', 'openid-end-to-end');

    // -- Step 1: wechat-login (unbound) ---------------------------------
    const loginRes1 = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'wx-code-1' },
    });
    expect(loginRes1.statusCode).toBe(200);
    const loginBody1 = loginRes1.json() as { status: string; bindToken: string };
    expect(loginBody1.status).toBe('unbound');
    expect(loginBody1.bindToken).toBeTruthy();
    const bindToken = loginBody1.bindToken;

    // -- Step 2: wechat-register ----------------------------------------
    const registerRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken,
        inviteToken: invite.token,
        username: 'enduser',
        displayName: 'End User',
        password: 'password123',
      },
    });
    expect(registerRes.statusCode).toBe(200);
    const registerBody = registerRes.json() as {
      user: { id: string; username: string; hasWechatBound: boolean };
      accessToken: string;
      refreshToken: string;
    };
    expect(registerBody.user.username).toBe('enduser');
    expect(registerBody.user.hasWechatBound).toBe(true);
    const userId = registerBody.user.id;
    let accessToken = registerBody.accessToken;
    let refreshToken = registerBody.refreshToken;

    // -- Step 3: GET /api/auth/me --------------------------------------
    const meRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json() as { user: { id: string; hasWechatBound: boolean } };
    expect(meBody.user.id).toBe(userId);
    expect(meBody.user.hasWechatBound).toBe(true);

    // -- Step 4: refresh-token -----------------------------------------
    // Wait briefly so the new token's iat differs (token strings can otherwise collide).
    await new Promise((r) => setTimeout(r, 1100));
    const refreshRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const refreshBody = refreshRes.json() as { accessToken: string; refreshToken: string };
    expect(refreshBody.accessToken).toBeTruthy();
    expect(refreshBody.accessToken).not.toBe(accessToken);
    expect(refreshBody.refreshToken).toBeTruthy();
    accessToken = refreshBody.accessToken;
    refreshToken = refreshBody.refreshToken;

    // -- Step 5: subscribe ---------------------------------------------
    const subRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/wechat/subscribe',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { accepted: [WECHAT_TEMPLATES.NEW_PHOTO] },
    });
    expect(subRes.statusCode).toBe(200);
    expect(subRes.json()).toEqual({ ok: true, recorded: 1 });
    const subsAfter = await ctx.prisma.wechatSubscription.findMany({ where: { userId } });
    expect(subsAfter.length).toBe(1);
    expect(subsAfter[0]?.quota).toBe(1);

    // -- Step 6: wechat-login (now bound) -----------------------------
    wechat.setCode('wx-code-2', 'openid-end-to-end');
    const loginRes2 = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'wx-code-2' },
    });
    expect(loginRes2.statusCode).toBe(200);
    const loginBody2 = loginRes2.json() as {
      status: string;
      user: { id: string };
      accessToken: string;
      refreshToken: string;
    };
    expect(loginBody2.status).toBe('bound');
    expect(loginBody2.user.id).toBe(userId);
    expect(loginBody2.accessToken).toBeTruthy();
    expect(loginBody2.refreshToken).toBeTruthy();

    // -- Step 7: wechat-unbind ----------------------------------------
    const unbindRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-unbind',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(unbindRes.statusCode).toBe(200);
    const unbindBody = unbindRes.json() as { user: { id: string; hasWechatBound: boolean } };
    expect(unbindBody.user.id).toBe(userId);
    expect(unbindBody.user.hasWechatBound).toBe(false);
    // Verify subscriptions wiped
    const subsAfterUnbind = await ctx.prisma.wechatSubscription.findMany({ where: { userId } });
    expect(subsAfterUnbind.length).toBe(0);

    // -- Step 8: wechat-login (back to unbound) ----------------------
    wechat.setCode('wx-code-3', 'openid-end-to-end');
    const loginRes3 = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-login',
      payload: { code: 'wx-code-3' },
    });
    expect(loginRes3.statusCode).toBe(200);
    const loginBody3 = loginRes3.json() as { status: string; bindToken: string };
    expect(loginBody3.status).toBe('unbound');
    expect(loginBody3.bindToken).toBeTruthy();
  });
});
