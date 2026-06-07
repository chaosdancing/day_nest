import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  RefreshTokenInput,
  type AuthResponse,
} from '@daynest/shared';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signAccess, signRefresh, verifyRefresh } from '../auth/jwt.js';
import { consumeInvite } from '../services/invites.js';
import { AppError } from '../lib/errors.js';

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
  user: UserRecord
): Promise<AuthResponse> {
  const access = await signAccess(
    { sub: user.id },
    app.deps.config.jwt.secret,
    app.deps.config.jwt.accessTtl
  );
  const refresh = await signRefresh(
    { sub: user.id },
    app.deps.config.jwt.refreshSecret,
    app.deps.config.jwt.refreshTtl
  );
  reply.setCookie(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: app.deps.config.env === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    domain: app.deps.config.cookieDomain,
    maxAge: app.deps.config.jwt.refreshTtl,
  });
  return { user: toUserDTO(user), accessToken: access };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    const parsed = RegisterInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; ')
      );
    }
    const { inviteToken, username, displayName, password } = parsed.data;
    const existing = await app.deps.prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw new AppError(400, 'USERNAME_TAKEN', 'username already in use');
    }
    try {
      await consumeInvite(app.deps.prisma, inviteToken);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'INVALID_INVITE';
      throw new AppError(400, code, 'invite token invalid or expired');
    }
    const passwordHash = await hashPassword(password);
    const user = await app.deps.prisma.user.create({
      data: { username, displayName, passwordHash },
    });
    return issueTokens(app, reply, user);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'bad input');
    }
    const user = await app.deps.prisma.user.findUnique({
      where: { username: parsed.data.username },
    });
    if (!user) {
      throw new AppError(401, 'BAD_CREDENTIALS', 'invalid username or password');
    }
    const ok = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!ok) {
      throw new AppError(401, 'BAD_CREDENTIALS', 'invalid username or password');
    }
    return issueTokens(app, reply, user);
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    const rt = req.cookies?.[REFRESH_COOKIE];
    if (!rt) throw new AppError(401, 'NO_REFRESH', 'missing refresh cookie');
    let claims;
    try {
      claims = await verifyRefresh(rt, app.deps.config.jwt.refreshSecret);
    } catch {
      throw new AppError(401, 'BAD_REFRESH', 'invalid refresh');
    }
    const user = await app.deps.prisma.user.findUnique({
      where: { id: claims.sub },
    });
    if (!user) throw new AppError(401, 'USER_GONE', 'user not found');
    return issueTokens(app, reply, user);
  });

  // Body-mode refresh for the WeChat mini-app, which can't carry HttpOnly cookies.
  // Returns BOTH tokens in the body, and also sets the refresh cookie so web
  // clients hitting this endpoint stay in sync.
  app.post('/api/auth/refresh-token', async (req, reply) => {
    const parsed = RefreshTokenInput.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join('; ')
      );
    }
    let claims;
    try {
      claims = await verifyRefresh(
        parsed.data.refreshToken,
        app.deps.config.jwt.refreshSecret
      );
    } catch {
      throw new AppError(401, 'BAD_REFRESH', 'invalid refresh');
    }
    const user = await app.deps.prisma.user.findUnique({
      where: { id: claims.sub },
    });
    if (!user) throw new AppError(401, 'USER_GONE', 'user not found');

    const access = await signAccess(
      { sub: user.id },
      app.deps.config.jwt.secret,
      app.deps.config.jwt.accessTtl
    );
    const refresh = await signRefresh(
      { sub: user.id },
      app.deps.config.jwt.refreshSecret,
      app.deps.config.jwt.refreshTtl
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
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { ok: true };
  });

  app.get(
    '/api/auth/me',
    { onRequest: [app.requireUser] },
    async (req) => {
      const user = await app.deps.prisma.user.findUnique({
        where: { id: req.user.id },
      });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'user gone');
      return { user: toUserDTO(user) };
    }
  );

  // Self-service profile update. Only `displayName` is editable for now;
  // username is the login key and must stay stable.
  app.patch(
    '/api/auth/me',
    { onRequest: [app.requireUser] },
    async (req) => {
      const parsed = UpdateProfileInput.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => i.message).join('; ')
        );
      }
      const next: Record<string, string> = {};
      if (parsed.data.displayName !== undefined) {
        const trimmed = parsed.data.displayName.trim();
        if (trimmed.length === 0) {
          throw new AppError(400, 'VALIDATION_ERROR', 'displayName empty');
        }
        next.displayName = trimmed;
      }
      if (Object.keys(next).length === 0) {
        const cur = await app.deps.prisma.user.findUnique({
          where: { id: req.user.id },
        });
        if (!cur) throw new AppError(404, 'NOT_FOUND', 'user gone');
        return { user: toUserDTO(cur) };
      }
      const user = await app.deps.prisma.user.update({
        where: { id: req.user.id },
        data: next,
      });
      return { user: toUserDTO(user) };
    }
  );
}
