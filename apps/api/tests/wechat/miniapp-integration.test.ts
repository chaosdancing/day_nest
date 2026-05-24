// End-to-end mini-app ↔ api integration smoke test.
//
// This file is intentionally placed inside `apps/api/tests/` (and not
// `apps/miniapp/tests/`) because the test boots the real Fastify server
// via the api's `buildApp` helper, which:
//   - requires a Prisma test database (`tests/helpers/db.ts` shells out
//     to `pnpm exec prisma migrate deploy`), and
//   - relies on `.env.test` being preloaded by api's vitest setupFiles.
// Both of those only resolve when the test runs with cwd=apps/api.
//
// To exercise the miniapp's own runtime code we reach across the workspace
// to `../../../miniapp/miniprogram/...`. That path is outside the api's
// tsconfig rootDir, so this file is `exclude`d from api's tsc build; vitest
// uses esbuild and resolves it at runtime regardless.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { FakeWechatClient } from '../helpers/wechat.fake.js';
import { createInvite } from '../../src/services/invites.js';
import { hashPassword } from '../../src/auth/password.js';

import { authStore } from '../../../miniapp/miniprogram/stores/authStore.js';
import { createApiClient } from '../../../miniapp/miniprogram/lib/api.js';
import {
  installWxMock,
  uninstallWxMock,
  type WxMock,
} from '../../../miniapp/tests/helpers/wxMock.js';

describe('miniapp ↔ api auth smoke', () => {
  let mock: WxMock;
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let wechat: FakeWechatClient;

  beforeEach(async () => {
    mock = installWxMock();
    wechat = new FakeWechatClient();
    ctx = await buildApp({ wechat });
    authStore.reset();

    // Rewire wx.request to route into the Fastify app via inject(). This lets
    // the miniapp's real `createApiClient` (with its 401 refresh / dedupe /
    // Bearer-header behavior) drive the integration end-to-end without
    // standing up a real HTTP listener.
    (globalThis as Record<string, unknown>).wx = {
      ...((globalThis as Record<string, unknown>).wx as object),
      getStorageSync: (k: string) => mock.storage.get(k) ?? '',
      setStorageSync: (k: string, v: unknown) => {
        mock.storage.set(k, v);
      },
      removeStorageSync: (k: string) => {
        mock.storage.delete(k);
      },
      login: (o: { success: (r: { code: string }) => void }) => {
        Promise.resolve().then(() => o.success({ code: 'wx-smoke-code' }));
      },
      request: (o: {
        url: string;
        method?: string;
        data?: unknown;
        header?: Record<string, string>;
        success: (r: { statusCode: number; data: unknown }) => void;
        fail: (e: unknown) => void;
      }) => {
        const path = new URL(o.url).pathname;
        ctx.app
          .inject({
            method: (o.method ?? 'GET') as 'GET' | 'POST',
            url: path,
            payload: o.data as Record<string, unknown> | undefined,
            headers: o.header,
          })
          .then((res) =>
            o.success({ statusCode: res.statusCode, data: res.json() }),
          )
          .catch(o.fail);
        return { abort: () => undefined };
      },
    };
  });

  afterEach(async () => {
    uninstallWxMock();
    authStore.reset();
    await ctx.cleanup();
  });

  it('register → tab landing: new wechat user with valid invite registers + lands in tab', async () => {
    const inviter = await ctx.prisma.user.create({
      data: {
        username: 'inviter',
        displayName: 'Inviter',
        passwordHash: await hashPassword('inviterpw123'),
      },
    });
    const invite = await createInvite(ctx.prisma, inviter.id, 24);
    wechat.setCode('wx-smoke-code', 'openid-smoke');

    const api = createApiClient({
      tokens: authStore,
      refreshUrl: 'http://localhost/api/auth/refresh-token',
    });

    const loginRes = await api.request<{ status: string; bindToken?: string }>({
      url: 'http://localhost/api/auth/wechat-login',
      method: 'POST',
      data: { code: 'wx-smoke-code' },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.data.status).toBe('unbound');
    expect(loginRes.data.bindToken).toBeTruthy();

    const regRes = await api.request<{
      user: {
        id: string;
        username: string;
        displayName: string;
        avatarKey: string | null;
        hasWechatBound: boolean;
      };
      accessToken: string;
      refreshToken: string;
    }>({
      url: 'http://localhost/api/auth/wechat-register',
      method: 'POST',
      data: {
        bindToken: loginRes.data.bindToken,
        inviteToken: invite.token,
        username: 'smokie',
        displayName: 'Smokie',
        password: 'password123',
      },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.data.user.username).toBe('smokie');
    expect(regRes.data.user.hasWechatBound).toBe(true);

    authStore.setSession({
      user: regRes.data.user,
      accessToken: regRes.data.accessToken,
      refreshToken: regRes.data.refreshToken,
    });

    // Verify the miniapp's authStore observable state matches the persisted
    // wx.storage values — the same path the timeline tab would read on cold
    // launch via authStore.hydrate().
    expect(authStore.getState().accessToken).toBe(regRes.data.accessToken);
    expect(authStore.getState().user?.username).toBe('smokie');
    expect(mock.storage.get('daynest.auth.access')).toBe(
      regRes.data.accessToken,
    );
    expect(mock.storage.get('daynest.auth.refresh')).toBe(
      regRes.data.refreshToken,
    );
  });

  it('bound user: a second wechat-login with same openid returns tokens directly', async () => {
    await ctx.prisma.user.create({
      data: {
        username: 'oldie',
        displayName: 'Oldie',
        passwordHash: await hashPassword('oldiepw123'),
        wechatOpenId: 'openid-old',
        wechatBoundAt: new Date(),
      },
    });
    wechat.setCode('wx-old-code', 'openid-old');

    const api = createApiClient({
      tokens: authStore,
      refreshUrl: 'http://localhost/api/auth/refresh-token',
    });

    const res = await api.request<{
      status: string;
      accessToken?: string;
      refreshToken?: string;
      user?: {
        id: string;
        username: string;
        displayName: string;
        avatarKey: string | null;
        hasWechatBound: boolean;
      };
    }>({
      url: 'http://localhost/api/auth/wechat-login',
      method: 'POST',
      data: { code: 'wx-old-code' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.data.status).toBe('bound');
    expect(res.data.accessToken).toBeTruthy();
    expect(res.data.refreshToken).toBeTruthy();
    expect(res.data.user?.username).toBe('oldie');

    if (res.data.user && res.data.accessToken && res.data.refreshToken) {
      authStore.setSession({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      });
    }
    expect(authStore.getState().user?.username).toBe('oldie');
    expect(mock.storage.get('daynest.auth.access')).toBe(res.data.accessToken);
  });
});
