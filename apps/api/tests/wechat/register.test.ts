import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { FakeWechatClient } from '../helpers/wechat.fake.js';
import { signBindToken } from '../../src/auth/bindToken.js';
import { createInvite } from '../../src/services/invites.js';
import { hashPassword } from '../../src/auth/password.js';
import { loadConfig } from '../../src/config.js';

describe('POST /api/auth/wechat-register', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let wechat: FakeWechatClient;

  beforeEach(async () => {
    wechat = new FakeWechatClient();
    ctx = await buildApp({ wechat });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function makeInviter(): Promise<string> {
    // Create an inviter user (with a password hash). For tests we just need
    // a User.id to attach the invite to.
    const inviter = await ctx.prisma.user.create({
      data: {
        username: 'inviter',
        displayName: 'Inviter',
        passwordHash: await hashPassword('whatever123'),
      },
    });
    return inviter.id;
  }

  it('creates a user bound to the wechat openid and issues tokens', async () => {
    const inviterId = await makeInviter();
    const invite = await createInvite(ctx.prisma, inviterId, 24);
    const bt = await signBindToken({ openid: 'wxid-new' }, loadConfig().jwt.secret);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        inviteToken: invite.token,
        username: 'newuser',
        displayName: 'New User',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      user: { username: string; hasWechatBound: boolean };
      accessToken: string;
      refreshToken: string;
    };
    expect(body.user.username).toBe('newuser');
    expect(body.user.hasWechatBound).toBe(true);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    // Verify cookie
    const cookie = res.headers['set-cookie'];
    expect(cookie).toBeTruthy();

    // Verify DB state
    const created = await ctx.prisma.user.findUnique({ where: { username: 'newuser' } });
    expect(created).toBeTruthy();
    expect(created?.wechatOpenId).toBe('wxid-new');
    expect(created?.wechatBoundAt).toBeTruthy();

    // Verify invite consumed
    const consumed = await ctx.prisma.invite.findUnique({ where: { token: invite.token } });
    expect(consumed?.consumedAt).toBeTruthy();
  });

  it('returns 400 BIND_TOKEN_INVALID for expired bindToken', async () => {
    const inviterId = await makeInviter();
    const invite = await createInvite(ctx.prisma, inviterId, 24);
    const bt = await signBindToken({ openid: 'wxid-x' }, loadConfig().jwt.secret, 0);
    await new Promise((r) => setTimeout(r, 1100));

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        inviteToken: invite.token,
        username: 'user2',
        displayName: 'X',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'BIND_TOKEN_INVALID' });
  });

  it('returns 400 USERNAME_TAKEN when username already exists', async () => {
    const inviterId = await makeInviter();
    const invite = await createInvite(ctx.prisma, inviterId, 24);
    // Create the user that will conflict
    await ctx.prisma.user.create({
      data: {
        username: 'taken',
        displayName: 'Existing',
        passwordHash: await hashPassword('whatever'),
      },
    });

    const bt = await signBindToken({ openid: 'wxid-y' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        inviteToken: invite.token,
        username: 'taken',
        displayName: 'X',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'USERNAME_TAKEN' });

    // Invite should NOT be consumed
    const inv = await ctx.prisma.invite.findUnique({ where: { token: invite.token } });
    expect(inv?.consumedAt).toBeNull();
  });

  it('returns 409 WECHAT_ALREADY_BOUND when openid is bound to existing user', async () => {
    const inviterId = await makeInviter();
    const invite = await createInvite(ctx.prisma, inviterId, 24);
    // Pre-bind a different user to the same openid
    await ctx.prisma.user.create({
      data: {
        username: 'oldbound',
        displayName: 'Old',
        passwordHash: await hashPassword('pw'),
        wechatOpenId: 'wxid-shared',
        wechatBoundAt: new Date(),
      },
    });

    const bt = await signBindToken({ openid: 'wxid-shared' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        inviteToken: invite.token,
        username: 'newone',
        displayName: 'N',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'WECHAT_ALREADY_BOUND' });

    // Invite NOT consumed
    const inv = await ctx.prisma.invite.findUnique({ where: { token: invite.token } });
    expect(inv?.consumedAt).toBeNull();
  });

  it('returns 400 INVALID_INVITE when invite token does not exist', async () => {
    const bt = await signBindToken({ openid: 'wxid-z' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        inviteToken: 'not-a-real-token',
        username: 'user3',
        displayName: 'X',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'INVALID_INVITE' });
  });

  it('returns 400 INVITE_ALREADY_USED when invite is consumed', async () => {
    const inviterId = await makeInviter();
    const invite = await createInvite(ctx.prisma, inviterId, 24);
    // Manually consume
    await ctx.prisma.invite.update({
      where: { id: invite.id },
      data: { consumedAt: new Date() },
    });

    const bt = await signBindToken({ openid: 'wxid-aa' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        inviteToken: invite.token,
        username: 'user4',
        displayName: 'X',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'INVITE_ALREADY_USED' });
  });

  it('returns 400 VALIDATION_ERROR for invalid username', async () => {
    const bt = await signBindToken({ openid: 'wxid-bb' }, loadConfig().jwt.secret);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/wechat-register',
      payload: {
        bindToken: bt,
        inviteToken: '12345678', // valid min length
        username: 'has space', // invalid: must match /^[a-zA-Z0-9_]+$/
        displayName: 'X',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
