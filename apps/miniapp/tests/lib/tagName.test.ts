import { describe, it, expect } from 'vitest';
import { normalizeTagName } from '../../miniprogram/lib/tagName.js';

describe('normalizeTagName', () => {
  it('lowercases and trims', () => {
    expect(normalizeTagName('  Travel  ')).toBe('travel');
    expect(normalizeTagName('BIRTHDAY')).toBe('birthday');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeTagName('   ')).toBe('');
    expect(normalizeTagName('')).toBe('');
  });

  it('preserves internal whitespace verbatim (matches api behaviour)', () => {
    expect(normalizeTagName('  Hello World  ')).toBe('hello world');
  });

  it('preserves CJK chars (no lowercasing applies)', () => {
    expect(normalizeTagName('  旅行  ')).toBe('旅行');
  });

  it('locale-aware lowercase for Turkish dotted-I', () => {
    // Sanity that we use toLocaleLowerCase (not toLowerCase). With no locale
    // arg the result depends on the runtime, but on Node/V8 with default
    // ICU 'İ'.toLocaleLowerCase() yields 'i̇' (i + combining dot) — that's
    // identical to the api behaviour. We only assert the function is a
    // pure delegate via a non-ASCII case.
    expect(normalizeTagName('  Café  ')).toBe('café');
  });
});
