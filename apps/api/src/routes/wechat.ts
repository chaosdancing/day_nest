import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import {
  WechatLoginInput,
  WechatBindInput,
  WechatRegisterInput,
  RedeemInviteInput,
  SubscribeAuthInput,
} from '@daynest/shared';
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
  canUpload: boolean;
};

function toUserDTO(u: UserRecord) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarKey: u.avatarKey,
    hasWechatBound: u.wechatOpenId !== null,
    canUpload: u.canUpload,
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
      // Explicitly avoid logging the raw err — undici populates err.cause.url
      // with the jscode2session URL, which carries `secret=APP_SECRET` in the
      // query string. Log only safe fields to prevent secret exfiltration.
      app.log.error(
        {
          errName: e instanceof Error ? e.name : 'Unknown',
          errMessage: e instanceof Error ? e.message : String(e),
        },
        'wechat jscode2session failed',
      );
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

  // Lightweight existence probe for the WeChat onboarding form: lets the client
  // decide whether a submit should bind to an existing account (username found)
  // or register a new one (username free). Public, since it's part of the
  // pre-auth login flow; reveals only a boolean for a single explicit username.
  app.get('/api/auth/username-available', async (req) => {
    const { username } = req.query as { username?: string };
    const u = (username ?? '').trim();
    if (!u) return { exists: false };
    const user = await app.deps.prisma.user.findUnique({
      where: { username: u },
      select: { id: true },
    });
    return { exists: user !== null };
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
    const { bindToken, inviteToken, username, displayName } = parsed.data;

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

    // Invite is OPTIONAL. With a valid invite → upload rights; without one →
    // a view-only account. Consume the invite LAST (and only if supplied) so
    // earlier failures don't burn it.
    let canUpload = false;
    if (inviteToken) {
      try {
        await consumeInvite(app.deps.prisma, inviteToken);
        canUpload = true;
      } catch (e) {
        const code = e instanceof Error ? e.message : 'INVALID_INVITE';
        throw new AppError(400, code, 'invite token invalid or expired');
      }
    }

    // WeChat accounts authenticate via openid, not a password. We still satisfy
    // the non-null passwordHash column with a random, unguessable secret so the
    // username/password login path stays closed for these accounts.
    const passwordHash = await hashPassword(randomBytes(24).toString('base64url'));
    const user = await app.deps.prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash,
        canUpload,
        wechatOpenId: openid,
        wechatBoundAt: new Date(),
      },
    });

    const tokens = await issueTokens(app, reply, user);
    return { user: toUserDTO(user), ...tokens };
  });

  // Upgrade a view-only account to an uploader by redeeming an invite. Lets a
  // WeChat user who signed up "just to browse" later unlock posting photos.
  app.post(
    '/api/auth/redeem-invite',
    { onRequest: [app.requireUser] },
    async (req) => {
      const parsed = RedeemInviteInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join('; '),
        );
      }
      const user = await app.deps.prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'user not found');
      if (user.canUpload) {
        // Already an uploader — don't burn the invite, just echo current state.
        return { user: toUserDTO(user) };
      }
      try {
        await consumeInvite(app.deps.prisma, parsed.data.inviteToken);
      } catch (e) {
        const code = e instanceof Error ? e.message : 'INVALID_INVITE';
        throw new AppError(400, code, 'invite token invalid or expired');
      }
      const updated = await app.deps.prisma.user.update({
        where: { id: user.id },
        data: { canUpload: true },
      });
      return { user: toUserDTO(updated) };
    },
  );

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

  app.post(
    '/api/wechat/subscribe',
    { onRequest: [app.requireUser] },
    async (req) => {
      const parsed = SubscribeAuthInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join('; '),
        );
      }
      const accepted = parsed.data.accepted;
      const userId = req.user.id;

      // Sequential to keep transaction semantics simple and to ensure
      // duplicates in the array compound correctly via incremental upserts.
      for (const templateId of accepted) {
        await app.deps.prisma.wechatSubscription.upsert({
          where: { userId_templateId: { userId, templateId } },
          create: { userId, templateId, quota: 1 },
          update: { quota: { increment: 1 } },
        });
      }

      return { ok: true, recorded: accepted.length };
    },
  );
}
