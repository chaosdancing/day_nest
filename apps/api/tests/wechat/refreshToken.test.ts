import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../helpers/buildApp.js';
import { signRefresh, signAccess, verifyAccess, verifyRefresh } from '../../src/auth/jwt.js';
import { hashPassword } from '../../src/auth/password.js';
import { loadConfig } from '../../src/config.js';

describe('POST /api/auth/refresh-token (body-mode)', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    ctx = await buildApp();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function makeUser(username = 'alice') {
    return ctx.prisma.user.create({
      data: {
        username,
        displayName: username,
        passwordHash: await hashPassword('whatever123'),
      },
    });
  }

  it('returns fresh access + refresh tokens for a valid refresh', async () => {
    const user = await makeUser();
    const cfg = loadConfig();
    const rt = await signRefresh({ sub: user.id }, cfg.jwt.refreshSecret, cfg.jwt.refreshTtl);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: rt },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const accessClaims = await verifyAccess(body.accessToken, cfg.jwt.secret);
    expect(accessClaims.sub).toBe(user.id);
    const refreshClaims = await verifyRefresh(body.refreshToken, cfg.jwt.refreshSecret);
    expect(refreshClaims.sub).toBe(user.id);

    const cookie = res.headers['set-cookie'];
    expect(cookie).toBeTruthy();
  });

  it('returns 401 BAD_REFRESH for tampered token', async () => {
    const user = await makeUser();
    const cfg = loadConfig();
    const rt = await signRefresh({ sub: user.id }, cfg.jwt.refreshSecret, cfg.jwt.refreshTtl);
    const tampered = rt.slice(0, -4) + 'AAAA';

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: tampered },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'BAD_REFRESH' });
  });

  it('returns 401 BAD_REFRESH for access token (wrong typ)', async () => {
    const user = await makeUser();
    const cfg = loadConfig();
    const at = await signAccess({ sub: user.id }, cfg.jwt.secret, cfg.jwt.accessTtl);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: at },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'BAD_REFRESH' });
  });

  it('returns 401 USER_GONE if user was deleted between issue and refresh', async () => {
    const user = await makeUser();
    const cfg = loadConfig();
    const rt = await signRefresh({ sub: user.id }, cfg.jwt.refreshSecret, cfg.jwt.refreshTtl);
    await ctx.prisma.user.delete({ where: { id: user.id } });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: rt },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'USER_GONE' });
  });

  it('returns 400 VALIDATION_ERROR when refreshToken is missing', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns 400 VALIDATION_ERROR when refreshToken is empty string', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/refresh-token',
      payload: { refreshToken: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
