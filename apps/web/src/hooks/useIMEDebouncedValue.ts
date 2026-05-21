import { useEffect, useState } from 'react';

/**
 * IME-aware debouncing for search inputs.
 *
 * The classic real-time search hook
 *
 *     const debounced = useDebounced(raw, 280);
 *
 * silently misbehaves for users typing through a Chinese / Japanese /
 * Korean IME: while they're tapping out pinyin like "zhou", the input
 * value is actually intermediate roman characters (or partial CJK)
 * and the debounce keeps firing on those half-typed values, hitting
 * the API with garbage and making the result list flicker.
 *
 * The fix is to listen for the W3C composition events:
 *
 *   - `compositionstart` fires when the IME opens its candidate window
 *   - `compositionend`  fires when the user commits a character (or
 *     escapes out of the candidate window)
 *
 * While a composition is active we suppress the debounce timer
 * entirely. After it ends, the next change settles the value (most
 * browsers fire an `input` event with the committed character right
 * before/around `compositionend`, so the effect re-runs as soon as
 * we flip `composing` back to false).
 *
 * Usage:
 *
 *   const [raw, setRaw] = useState('');
 *   const { committed, compositionProps } = useIMEDebouncedValue(raw, 280);
 *
 *   <input
 *     value={raw}
 *     onChange={(e) => setRaw(e.target.value)}
 *     {...compositionProps}
 *   />
 *
 *   // `committed` is what you pipe into your query.
 */
export function useIMEDebouncedValue<T extends string>(
  raw: T,
  delay = 280
): {
  committed: T;
  composing: boolean;
  compositionProps: {
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
  };
} {
  const [composing, setComposing] = useState(false);
  const [committed, setCommitted] = useState<T>(raw);

  useEffect(() => {
    // Whilst the IME owns the input, the visible string is mid-flight
    // (raw pinyin or partial kana). Don't expose it to consumers yet.
    if (composing) return;
    const id = window.setTimeout(() => setCommitted(raw), delay);
    return () => window.clearTimeout(id);
  }, [raw, composing, delay]);

  return {
    committed,
    composing,
    compositionProps: {
      onCompositionStart: () => setComposing(true),
      onCompositionEnd: () => setComposing(false),
    },
  };
}
