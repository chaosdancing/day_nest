/**
 * <page-hero emoji="📖" title="时光轴" subtitle="TIMELINE · 1 ENTRIES" motion="wobble" />
 *
 * Visual parity with apps/web/src/components/scrapbook/PageHero.tsx.
 * Motion modes:
 *   pop     entry-only scale spring (default; matches "pop" on web)
 *   wobble  gentle infinite rotation (matches "wobble")
 *   bounce  subtle vertical hop      (matches "bounce")
 *
 * Pure CSS animations — no JS runtime cost.
 */
Component({
  options: { multipleSlots: false },
  properties: {
    emoji: { type: String, value: '' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    /** 'pop' | 'wobble' | 'bounce' */
    motion: { type: String, value: 'pop' },
    /** Extra emoji color hook, e.g. 'tinted-red' for the favorites heart. */
    emojiClass: { type: String, value: '' },
  },
});
