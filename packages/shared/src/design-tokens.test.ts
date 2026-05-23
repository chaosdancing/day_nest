import { describe, it, expect } from 'vitest';
import { tokens, type ThemeMode } from './design-tokens.js';

describe('design tokens', () => {
  it('exposes the expected paper, ink, and shadow groups', () => {
    expect(tokens.paper.cream).toBe('#FBF4E4');
    expect(tokens.paper.aged).toBe('#F3E6CB');
    expect(tokens.ink.primary).toBe('#2A2520');
    expect(tokens.ink.sticker).toBe('#D4523A');
    expect(tokens.shadow.polaroid).toContain('rgba');
  });

  it('provides dark-mode overrides for paper and ink', () => {
    expect(tokens.dark.paper.cream).not.toBe(tokens.paper.cream);
    expect(tokens.dark.ink.primary).not.toBe(tokens.ink.primary);
  });

  it('ThemeMode type accepts the three documented values', () => {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    expect(modes).toHaveLength(3);
  });
});
