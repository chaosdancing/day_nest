import { describe, it, expect } from 'vitest';
import { signBindToken, verifyBindToken } from '../../src/auth/bindToken.js';
import { signAccess, verifyAccess } from '../../src/auth/jwt.js';

const SECRET = 'a'.repeat(64);

describe('bindToken', () => {
  it('sign + verify roundtrips an openid', async () => {
    const token = await signBindToken({ openid: 'wx-openid-abc' }, SECRET);
    const claims = await verifyBindToken(token, SECRET);
    expect(claims.openid).toBe('wx-openid-abc');
    expect(claims.typ).toBe('bind');
  });

  it('rejects an access token via verifyBindToken (typ mismatch)', async () => {
    const accessToken = await signAccess({ sub: 'user-xyz' }, SECRET, 60);
    await expect(verifyBindToken(accessToken, SECRET)).rejects.toThrow();
  });

  it('rejects a bind token via verifyAccess (typ mismatch)', async () => {
    const bindToken = await signBindToken({ openid: 'wx-openid-abc' }, SECRET);
    await expect(verifyAccess(bindToken, SECRET)).rejects.toThrow();
  });

  it('rejects a tampered token', async () => {
    const token = await signBindToken({ openid: 'wx-openid-abc' }, SECRET);
    const tampered = token.slice(0, -4) + 'AAAA';
    await expect(verifyBindToken(tampered, SECRET)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signBindToken({ openid: 'wx-openid-abc' }, SECRET, 0);
    await new Promise((r) => setTimeout(r, 1100));
    await expect(verifyBindToken(token, SECRET)).rejects.toThrow();
  });

  it('default TTL is 300 seconds', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signBindToken({ openid: 'wx-openid-abc' }, SECRET);
    const claims = await verifyBindToken(token, SECRET);
    const after = Math.floor(Date.now() / 1000);
    expect(claims.exp).toBeGreaterThanOrEqual(before + 300 - 1);
    expect(claims.exp).toBeLessThanOrEqual(after + 300 + 1);
  });
});
