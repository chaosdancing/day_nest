import type { FastifyInstance, FastifyReply } from 'fastify';
import { WechatLoginInput, WechatBindInput, WechatRegisterInput } from '@daynest/shared';
import { AppError } from '../lib/errors.js';
import { WechatApiError } from '../wechat/client.js';
import { signAccess, signRefresh } from '../auth/jwt.js';
import { signBindToken, verifyBindToken } from '../auth/bindToken.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { consumeInvite } from '../services/invites.js';

const REFRESH_COOKIE = 'daynest_rt';

type UserRecord = {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  wechatOpenId: string | null;
};

function toUserDTO(u: UserRecord) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarKey: u.avatarKey,
    hasWechatBound: u.wechatOpenId !== null,
  };
}

async function issueTokens(
  app: FastifyInstance,
  reply: FastifyReply,
  user: UserRecord,
): Promise<{ accessToken: string; refreshToken: string }> {
  const access = await signAccess(
    { sub: user.id },
    app.deps.config.jwt.secret,
    app.deps.config.jwt.accessTtl,
  );
  const refresh = await signRefresh(
    { sub: user.id },
    app.deps.config.jwt.refreshSecret,
    app.deps.config.jwt.refreshTtl,
  );
  reply.setCookie(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: app.deps.config.env === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    domain: app.deps.config.cookieDomain,
    maxAge: app.deps.config.jwt.refreshTtl,
  });
  return { accessToken: access, refreshToken: refresh };
}

export async function registerWechatRoutes(app: FastifyInstance) {
  app.post('/api/auth/wechat-login', async (req, reply) => {
    if (!app.deps.config.wechat.enabled) {
      throw new AppError(503, 'WECHAT_DISABLED', 'wechat client is not configured');
    }
    const parsed = WechatLoginInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }

    let openid: string;
    try {
      const sess = await app.deps.wechat.jsCode2Session(parsed.data.code);
      openid = sess.openid;
    } catch (e) {
      if (e instanceof WechatApiError) {
        throw new AppError(400, 'WECHAT_CODE_INVALID', `wechat rejected code: ${e.errmsg}`);
      }
      app.log.error({ err: e }, 'wechat jscode2session failed');
      throw new AppError(502, 'WECHAT_UPSTREAM', 'wechat upstream unavailable');
    }

    const user = await app.deps.prisma.user.findUnique({
      where: { wechatOpenId: openid },
    });
    if (user) {
      const tokens = await issueTokens(app, reply, user);
      return { status: 'bound' as const, user: toUserDTO(user), ...tokens };
    }

    const bindToken = await signBindToken({ openid }, app.deps.config.jwt.secret);
    return { status: 'unbound' as const, bindToken };
  });

  app.post('/api/auth/wechat-bind', async (req, reply) => {
    if (!app.deps.config.wechat.enabled) {
      throw new AppError(503, 'WECHAT_DISABLED', 'wechat client is not configured');
    }
    const parsed = WechatBindInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }

    let openid: string;
    try {
      const claims = await verifyBindToken(parsed.data.bindToken, app.deps.config.jwt.secret);
      openid = claims.openid;
    } catch {
      throw new AppError(400, 'BIND_TOKEN_INVALID', 'bind token is expired or invalid');
    }

    const user = await app.deps.prisma.user.findUnique({
      where: { username: parsed.data.username },
    });
    if (!user) {
      throw new AppError(401, 'CREDENTIALS_INVALID', 'invalid username or password');
    }
    const ok = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!ok) {
      throw new AppError(401, 'CREDENTIALS_INVALID', 'invalid username or password');
    }

    if (user.wechatOpenId !== null) {
      throw new AppError(
        409,
        'USER_ALREADY_BOUND',
        'this account is already bound to a wechat user',
      );
    }

    const conflict = await app.deps.prisma.user.findUnique({
      where: { wechatOpenId: openid },
    });
    if (conflict) {
      throw new AppError(
        409,
        'WECHAT_ALREADY_BOUND',
        'this wechat account is already bound to another daynest user',
      );
    }

    const updated = await app.deps.prisma.user.update({
      where: { id: user.id },
      data: { wechatOpenId: openid, wechatBoundAt: new Date() },
    });

    const tokens = await issueTokens(app, reply, updated);
    return { user: toUserDTO(updated), ...tokens };
  });

  app.post('/api/auth/wechat-register', async (req, reply) => {
    if (!app.deps.config.wechat.enabled) {
      throw new AppError(503, 'WECHAT_DISABLED', 'wechat client is not configured');
    }
    const parsed = WechatRegisterInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }
    const { bindToken, inviteToken, username, displayName, password } = parsed.data;

    let openid: string;
    try {
      const claims = await verifyBindToken(bindToken, app.deps.config.jwt.secret);
      openid = claims.openid;
    } catch {
      throw new AppError(400, 'BIND_TOKEN_INVALID', 'bind token is expired or invalid');
    }

    const existing = await app.deps.prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw new AppError(400, 'USERNAME_TAKEN', 'username already in use');
    }

    const conflict = await app.deps.prisma.user.findUnique({
      where: { wechatOpenId: openid },
    });
    if (conflict) {
      throw new AppError(
        409,
        'WECHAT_ALREADY_BOUND',
        'this wechat account is already bound to another daynest user',
      );
    }

    // Consume invite LAST so earlier failures don't burn an invite.
    try {
      await consumeInvite(app.deps.prisma, inviteToken);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'INVALID_INVITE';
      throw new AppError(400, code, 'invite token invalid or expired');
    }

    const passwordHash = await hashPassword(password);
    const user = await app.deps.prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash,
        wechatOpenId: openid,
        wechatBoundAt: new Date(),
      },
    });

    const tokens = await issueTokens(app, reply, user);
    return { user: toUserDTO(user), ...tokens };
  });

  app.post(
    '/api/auth/wechat-unbind',
    { onRequest: [app.requireUser] },
    async (req) => {
      const user = await app.deps.prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'user not found');
      }
      if (user.wechatOpenId === null) {
        throw new AppError(400, 'NOT_BOUND', 'this account is not bound to a wechat user');
      }
      const updated = await app.deps.prisma.$transaction(async (tx) => {
        await tx.wechatSubscription.deleteMany({ where: { userId: user.id } });
        return tx.user.update({
          where: { id: user.id },
          data: { wechatOpenId: null, wechatBoundAt: null },
        });
      });
      return { user: toUserDTO(updated) };
    },
  );
}
