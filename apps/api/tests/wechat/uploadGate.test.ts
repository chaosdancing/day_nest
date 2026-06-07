import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { FakeWechatClient } from '../helpers/wechat.fake.js';
import { signBindToken } from '../../src/auth/bindToken.js';
import { createInvite } from '../../src/services/invites.js';
import { hashPassword } from '../../src/auth/password.js';
import { loadConfig } from '../../src/config.js';

/**
 * The WeChat one-tap flow now creates accounts directly. An invite is optional:
 * with one the account may post photos (canUpload), without one it is view-only
 * and must redeem an invite later to unlock uploads. The server enforces this on
 * every write endpoint via requireUploader.
 */
describe('WeChat register upload gating', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let wechat: FakeWechatClient;

  beforeEach(async () => {
    wechat = new FakeWechatClient();
    ctx = await buildApp({ wechat });
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  async function inviterId(): Promise<string> {
    const u = await ctx.prisma.user.create({
      data: { username: 'inviter', displayName: 'Inviter', passwordHash: await hashPassword('whatever123') },
    });
    return u.id;
  }

  async function registerViaWechat(opts: { openid: string; username: string; inviteToken?: string }) {
    const bt = await signBindToken({ openid: opts.openid }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        username: opts.username,
        displayName: '微信用户',
        ...(opts.inviteToken ? { inviteToken: opts.inviteToken } : {}),
      },
    });
    return res;
  }

  const samplePayload = {
    title: '周末',
    occurredOn: '2024-01-01',
    tags: [],
    photos: [{ fileKey: 'photos/draft/p1.jpg', width: 100, height: 100, caption: null, takenAt: null, tags: [] }],
  };

  it('registers a view-only account (no invite) → canUpload false, can browse but not post', async () => {
    const res = await registerViaWechat({ openid: 'wx-viewer', username: 'viewer1' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { canUpload: boolean }; accessToken: string };
    expect(body.user.canUpload).toBe(false);
    const token = body.accessToken;

    // Browsing is allowed.
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/collections',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);

    // Posting is blocked.
    const post = await ctx.app.inject({
      method: 'POST',
      url: '/api/collections',
      headers: { authorization: `Bearer ${token}` },
      payload: samplePayload,
    });
    expect(post.statusCode).toBe(403);
    expect(post.json()).toMatchObject({ code: 'UPLOAD_NOT_ALLOWED' });
  });

  it('registers an uploader when an invite is supplied → canUpload true, can post', async () => {
    const invite = await createInvite(ctx.prisma, await inviterId(), 24);
    const res = await registerViaWechat({ openid: 'wx-up', username: 'uploader1', inviteToken: invite.token });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { canUpload: boolean }; accessToken: string };
    expect(body.user.canUpload).toBe(true);

    const post = await ctx.app.inject({
      method: 'POST',
      url: '/api/collections',
      headers: { authorization: `Bearer ${body.accessToken}` },
      payload: samplePayload,
    });
    expect(post.statusCode).toBe(201);
  });

  it('redeem-invite upgrades a viewer to an uploader', async () => {
    const reg = await registerViaWechat({ openid: 'wx-redeem', username: 'viewer2' });
    const token = (reg.json() as { accessToken: string }).accessToken;
    const invite = await createInvite(ctx.prisma, await inviterId(), 24);

    const redeem = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/redeem-invite',
      headers: { authorization: `Bearer ${token}` },
      payload: { inviteToken: invite.token },
    });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json()).toMatchObject({ user: { canUpload: true } });

    // Invite consumed.
    const consumed = await ctx.prisma.invite.findUnique({ where: { token: invite.token } });
    expect(consumed?.consumedAt).toBeTruthy();

    // The same (still valid) access token can now post.
    const post = await ctx.app.inject({
      method: 'POST',
      url: '/api/collections',
      headers: { authorization: `Bearer ${token}` },
      payload: samplePayload,
    });
    expect(post.statusCode).toBe(201);
  });

  it('redeem-invite rejects an invalid invite', async () => {
    const reg = await registerViaWechat({ openid: 'wx-bad', username: 'viewer3' });
    const token = (reg.json() as { accessToken: string }).accessToken;
    const redeem = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/redeem-invite',
      headers: { authorization: `Bearer ${token}` },
      payload: { inviteToken: 'nope-not-real' },
    });
    expect(redeem.statusCode).toBe(400);
    expect(redeem.json()).toMatchObject({ code: 'INVALID_INVITE' });
  });
});
