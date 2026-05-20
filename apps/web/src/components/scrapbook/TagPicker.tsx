import { useMemo, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { deterministicTilt } from '@/lib/deterministicTilt';

export type TagPickerProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * Tags pre-attached to the target (e.g. when merging into existing collection).
   * Shown as locked chips and always included in `value`.
   */
  lockedTags?: string[];
  /** Suggestions from the global tag list. */
  suggestions?: string[];
  placeholder?: string;
  size?: 'sm' | 'md';
  emptyHint?: string;
  className?: string;
};

const TAPE_COLORS = [
  'rgba(255, 240, 160, 0.72)',
  'rgba(255, 200, 150, 0.72)',
  'rgba(200, 230, 200, 0.72)',
  'rgba(200, 220, 250, 0.72)',
  'rgba(250, 200, 220, 0.72)',
];

function colorFor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffffffff;
  return TAPE_COLORS[Math.abs(h) % TAPE_COLORS.length]!;
}

function normalize(raw: string): string {
  return raw.trim().toLocaleLowerCase();
}

function parseInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

export function TagPicker({
  value,
  onChange,
  lockedTags = [],
  suggestions = [],
  placeholder = '输入回车 / 空格添加',
  size = 'md',
  emptyHint,
  className,
}: TagPickerProps) {
  const [input, setInput] = useState('');

  const lockedSet = useMemo(
    () => new Set(lockedTags.map(normalize)),
    [lockedTags]
  );
  const valueSet = useMemo(() => new Set(value.map(normalize)), [value]);

  const addTags = (incoming: string[]) => {
    if (incoming.length === 0) return;
    const next = [...value];
    for (const t of incoming) {
      const n = normalize(t);
      if (n && !next.some((x) => normalize(x) === n)) {
        next.push(t.trim());
      }
    }
    onChange(next);
  };

  const removeTag = (t: string) => {
    const n = normalize(t);
    if (lockedSet.has(n)) return;
    onChange(value.filter((x) => normalize(x) !== n));
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      const parsed = parseInput(input);
      addTags(parsed);
      setInput('');
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      const last = value[value.length - 1]!;
      if (!lockedSet.has(normalize(last))) {
        onChange(value.slice(0, -1));
      }
    }
  };

  const onInputBlur = () => {
    const parsed = parseInput(input);
    if (parsed.length > 0) {
      addTags(parsed);
      setInput('');
    }
  };

  const visibleSuggestions = useMemo(() => {
    const q = normalize(input);
    return suggestions
      .filter((s) => {
        const n = normalize(s);
        if (valueSet.has(n)) return false;
        if (lockedSet.has(n)) return false;
        if (!q) return true;
        return n.includes(q);
      })
      .slice(0, 18);
  }, [suggestions, input, valueSet, lockedSet]);

  const chipPad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 min-h-[2.5rem] py-1 px-1 border-b-2 transition-colors',
          'border-kraft/40 focus-within:border-kraft'
        )}
      >
        {value.map((t) => {
          const isLocked = lockedSet.has(normalize(t));
          const angle = deterministicTilt(t, 3);
          return (
            <span
              key={`${t}-${isLocked ? 'locked' : 'editable'}`}
              className={cn(
                'tape font-hand inline-flex items-center gap-1.5 select-none',
                chipPad,
                isLocked && 'opacity-90'
              )}
              style={{
                transform: `rotate(${angle}deg)`,
                background: colorFor(t),
              }}
              title={isLocked ? '此标签来自已有集合，无法在此移除' : undefined}
            >
              <span>{t}</span>
              {isLocked ? (
                <span className="text-[10px] opacity-60">●</span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="leading-none text-ink/60 hover:text-pin-red"
                  aria-label={`移除 ${t}`}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKey}
          onBlur={onInputBlur}
          placeholder={value.length === 0 ? placeholder : ''}
          className={cn(
            'flex-1 min-w-[8rem] bg-transparent outline-none placeholder:text-ink/30',
            size === 'sm' ? 'text-xs py-0.5' : 'text-sm py-1'
          )}
        />
      </div>

      {visibleSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] uppercase tracking-widest font-mono text-ink/40 self-center mr-1">
            常用
          </span>
          {visibleSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTags([s])}
              className={cn(
                'rounded-full border border-kraft/40 bg-paper/70 hover:bg-kraft/15 hover:border-kraft',
                'transition-colors font-hand text-ink/80',
                size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-sm'
              )}
            >
              + {s}
            </button>
          ))}
        </div>
      ) : value.length === 0 && emptyHint ? (
        <p className="text-xs text-ink/40 italic font-hand">{emptyHint}</p>
      ) : null}
    </div>
  );
}
