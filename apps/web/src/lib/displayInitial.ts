/**
 * Pick a single user-perceived character from the start of a display
 * name so we can render an avatar bubble like "M" or "妈" or "🦊".
 *
 * Why this isn't just `s[0]`:
 *   - `'🦊'[0]` returns a lone surrogate half, which renders as a
 *     replacement glyph (□ / ?) in most browsers.
 *   - `'妈妈'[0]` is fine (BMP char) but `'𝓜'[0]` (a SMP math letter)
 *     is broken — that's a surrogate pair.
 *   - `'👨‍👩‍👧'` is a ZWJ sequence of three emoji glyphs joined by
 *     U+200D; the user perceives it as ONE grapheme. Naïve indexing
 *     gives us just the man, dropping the family meaning.
 *
 * Strategy:
 *   1. If the runtime exposes `Intl.Segmenter` (modern Chrome / Safari /
 *      Firefox 125+), use it to pull the first true grapheme cluster.
 *   2. Otherwise fall back to `Array.from(str)[0]`, which at least
 *      iterates by code point so single-codepoint emoji and SMP chars
 *      stay intact (just no ZWJ grouping).
 *   3. Latin letters are uppercased for the classic "M" avatar look;
 *      CJK / emoji are returned as-is.
 */
export function displayInitial(...candidates: Array<string | null | undefined>): string {
  const raw = candidates.find((s): s is string => !!s && s.trim().length > 0);
  if (!raw) return '·';
  const trimmed = raw.trim();

  const segmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;

  const first =
    segmenter?.segment(trimmed)[Symbol.iterator]().next().value?.segment ??
    Array.from(trimmed)[0] ??
    trimmed[0]!;

  // Only uppercase ASCII / extended-Latin letters. Don't ever try to
  // upper-case a CJK or emoji char (some emoji have "uppercase" forms
  // that look completely different — e.g. regional indicators).
  return /^[A-Za-zÀ-ÿ]$/.test(first) ? first.toUpperCase() : first;
}
