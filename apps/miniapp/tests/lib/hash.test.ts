import { describe, it, expect } from 'vitest';
import { stableInt, stableAngle } from '../../miniprogram/lib/hash.js';

describe('hash util', () => {
  it('stableInt is deterministic across calls', () => {
    expect(stableInt('photo-1', 4)).toBe(stableInt('photo-1', 4));
    expect(stableInt('photo-2', 4)).toBe(stableInt('photo-2', 4));
  });

  it('stableInt yields a value in [0, max)', () => {
    for (let i = 0; i < 50; i++) {
      const v = stableInt(`seed-${i}`, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
    }
  });

  it('stableInt returns 0 when max <= 0', () => {
    expect(stableInt('x', 0)).toBe(0);
    expect(stableInt('x', -3)).toBe(0);
  });

  it('stableAngle returns a value in [-rangeDeg, +rangeDeg]', () => {
    for (let i = 0; i < 20; i++) {
      const a = stableAngle(`p-${i}`, 6);
      expect(a).toBeGreaterThanOrEqual(-6);
      expect(a).toBeLessThanOrEqual(6);
    }
  });

  it('stableAngle is deterministic', () => {
    expect(stableAngle('abc', 5)).toBe(stableAngle('abc', 5));
  });
});
