import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password', () => {
  it('verifies the same password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
  });

  it('rejects wrong password', async () => {
    const h = await hashPassword('a-strong-password');
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });

  it('rejects garbage hashes', async () => {
    expect(await verifyPassword('not-a-real-hash', 'whatever')).toBe(false);
  });
});
