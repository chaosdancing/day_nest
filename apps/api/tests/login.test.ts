import { describe, it, expect } from 'vitest';
import { buildApp } from './helpers/buildApp.js';
import { hashPassword } from '../src/auth/password.js';

describe('POST /api/auth/login', () => {
  it('returns tokens on success', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'dad',
        displayName: 'Dad',
        passwordHash: await hashPassword('hello-world-2024'),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'dad', password: 'hello-world-2024' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeTruthy();
    await ctx.cleanup();
  });

  it('fails on wrong password', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'dad',
        displayName: 'Dad',
        passwordHash: await hashPassword('right-password'),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'dad', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('fails on unknown username', async () => {
    const ctx = await buildApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'noone', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
    await ctx.cleanup();
  });

  it('GET /api/auth/me returns current user', async () => {
    const ctx = await buildApp();
    await ctx.prisma.user.create({
      data: {
        username: 'dad',
        displayName: 'Dad',
        passwordHash: await hashPassword('hello-world-2024'),
      },
    });
    const loginRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'dad', password: 'hello-world-2024' },
    });
    const { accessToken } = loginRes.json();
    const meRes = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.username).toBe('dad');
    await ctx.cleanup();
  });
});
