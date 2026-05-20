import { describe, it, expect } from 'vitest';
import {
  signAccess,
  verifyAccess,
  signRefresh,
  verifyRefresh,
} from '../src/auth/jwt.js';

const secret = 'a'.repeat(32);
const refreshSecret = 'b'.repeat(32);

describe('jwt', () => {
  it('signs and verifies access token', async () => {
    const token = await signAccess({ sub: 'user-1' }, secret, 60);
    const claims = await verifyAccess(token, secret);
    expect(claims.sub).toBe('user-1');
  });

  it('rejects expired access token', async () => {
    const token = await signAccess({ sub: 'user-1' }, secret, -1);
    await expect(verifyAccess(token, secret)).rejects.toBeTruthy();
  });

  it('refresh token uses separate type marker', async () => {
    const token = await signRefresh({ sub: 'user-1' }, refreshSecret, 60);
    await expect(verifyAccess(token, refreshSecret)).rejects.toBeTruthy();
    const claims = await verifyRefresh(token, refreshSecret);
    expect(claims.sub).toBe('user-1');
  });
});
