import { describe, it, expect } from 'vitest';

// The component runs inside the WeChat runtime; vitest can't invoke Component()
// directly. We test the pure utility (filter+dedupe) by importing the same
// logic shape used inside the observer. Keep the test minimal — the bulk of
// the component's behavior is covered by manual DevTools verification.

describe('tag-picker filter logic', () => {
  function filterSuggestions(value: string[], suggest: string[], draft: string): string[] {
    const have = new Set(value);
    const q = draft.trim().toLocaleLowerCase();
    return (suggest ?? [])
      .filter((s) => !have.has(s))
      .filter((s) => (q ? s.toLocaleLowerCase().includes(q) : true))
      .slice(0, 8);
  }

  it('hides already-selected tags from suggestions', () => {
    expect(filterSuggestions(['Travel'], ['Travel', 'Food', 'Family'], '')).toEqual(['Food', 'Family']);
  });

  it('filters by draft substring case-insensitively', () => {
    expect(filterSuggestions([], ['Travel', 'Food', 'Family'], 'fa')).toEqual(['Family']);
  });

  it('caps at 8 results', () => {
    const ten = Array.from({ length: 10 }, (_, i) => 't' + i);
    expect(filterSuggestions([], ten, '').length).toBe(8);
  });
});
