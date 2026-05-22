import type { FastifyInstance, FastifyReply } from 'fastify';
import { WechatLoginInput } from '@daynest/shared';
import { AppError } from '../lib/errors.js';
import { WechatApiError } from '../wechat/client.js';
import { signAccess, signRefresh } from '../auth/jwt.js';
import { signBindToken } from '../auth/bindToken.js';

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
}
