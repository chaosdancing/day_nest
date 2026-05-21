import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionSummaryDTO } from '@daynest/shared';
import { useCollections } from '@/hooks/useCollections';
import { useIMEDebouncedValue } from '@/hooks/useIMEDebouncedValue';
import { StackedPolaroid } from '@/components/scrapbook/StackedPolaroid';
import { TapeBadge } from '@/components/scrapbook/TapeBadge';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { PageHero } from '@/components/scrapbook/PageHero';
import { Collapse } from '@/components/scrapbook/Collapse';
import {
  buildDatePresetRange,
  type DatePreset,
} from '@/lib/timelineFilters';

const PRESET_OPTIONS: Array<{ value: DatePreset; label: string; emoji: string }> = [
  { value: 'all', label: '全部', emoji: '🌐' },
  { value: 'year', label: '今年', emoji: '🌞' },
  { value: 'quarter', label: '近 90 天', emoji: '⏳' },
  { value: 'custom', label: '自定义', emoji: '✏️' },
];

/**
 * Build the array of photos the StackedPolaroid will render for a
 * collection card. Falls back to cover-only when previewPhotos is
 * unexpectedly empty (legacy backend, hand-built fixtures), and to an
 * empty array when there's no cover either so the stack just hides.
 */
function previewStack(
  c: CollectionSummaryDTO
): Array<{ id: string; thumbnailUrl: string }> {
  if (c.previewPhotos.length > 0) {
    return c.previewPhotos.map((p) => ({
      id: p.id,
      thumbnailUrl: p.thumbnailUrl,
    }));
  }
  if (c.coverPhoto) {
    return [
      { id: c.coverPhoto.id, thumbnailUrl: c.coverPhoto.thumbnailUrl },
    ];
  }
  return [];
}

function formatOccurred(occurredOn: string, occurredUntil: string | null) {
  const start = new Date(occurredOn);
  const format = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
      d.getDate()
    ).padStart(2, '0')}`;
  const startStr = format(start);
  if (!occurredUntil) return startStr;
  const end = new Date(occurredUntil);
  if (start.toDateString() === end.toDateString()) return startStr;
  return `${startStr} - ${format(end)}`;
}

export function TimelinePage() {
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customRange, setCustomRange] = useState({
    dateFrom: '',
    dateTo: '',
  });
  const [locationFilter, setLocationFilter] = useState('');
  const [titleFilter, setTitleFilter] = useState('');
  // Both inputs are debounced and IME-aware: while the user is
  // tapping out pinyin in either field, the candidate window is open
  // and the visible value is mid-flight (raw roman chars or partial
  // CJK). The hook suppresses the debounce timer during composition
  // so we don't fire half-typed queries.
  const { committed: debouncedTitle, compositionProps: titleIme } =
    useIMEDebouncedValue(titleFilter.trim(), 280);
  const { committed: debouncedLocation, compositionProps: locationIme } =
    useIMEDebouncedValue(locationFilter.trim(), 280);

  const dateRange =
    datePreset === 'custom'
      ? {
          dateFrom: customRange.dateFrom || undefined,
          dateTo: customRange.dateTo || undefined,
        }
      : buildDatePresetRange(datePreset);

  const q = useCollections({
    limit: 20,
    ...dateRange,
    location: debouncedLocation || undefined,
    title: debouncedTitle || undefined,
  });
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) {
        q.fetchNextPage();
      }
    });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const locationSuggestions = useMemo(
    () =>
      Array.from(
        new Set(items.map((c) => c.location).filter((v): v is string => !!v))
      ).slice(0, 8),
    [items]
  );
  const hasFilters =
    datePreset !== 'all' ||
    !!customRange.dateFrom ||
    !!customRange.dateTo ||
    !!debouncedLocation ||
    !!debouncedTitle;

  if (q.isLoading) {
    return (
      <div className="text-center text-ink/60 dark:text-paper/60 py-16">
        正在翻开相册...
      </div>
    );
  }

  return (
    <div className="relative pb-24">
      <PageHero
        emoji="📖"
        title="时间轴"
        subtitle={`TIMELINE · ${items.length} ENTRIES`}
        motion="wobble"
      />

      <section className="sticky top-[57px] z-20 mb-6 sm:mb-8 rounded-lg border border-kraft/25 bg-paper/90 p-2.5 sm:p-3 shadow-sm backdrop-blur dark:border-paper/15 dark:bg-ink-deep/85">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {PRESET_OPTIONS.map(({ value, label, emoji }) => {
            const isActive = datePreset === value;
            const showInlineClear = isActive && value !== 'all';
            return (
              <span key={value} className="inline-flex items-stretch">
                <button
                  type="button"
                  onClick={() => setDatePreset(value)}
                  className={
                    isActive
                      ? `bg-kraft px-2.5 sm:px-3 py-1 text-xs sm:text-sm text-paper shadow-sm dark:bg-kraft-light dark:text-ink ${
                          showInlineClear ? 'rounded-l-full' : 'rounded-full'
                        }`
                      : 'rounded-full border border-kraft/30 bg-paper/70 px-2.5 sm:px-3 py-1 text-xs sm:text-sm text-ink/65 hover:border-kraft hover:text-ink dark:border-paper/20 dark:bg-paper/5 dark:text-paper/65 dark:hover:border-paper/40 dark:hover:text-paper'
                  }
                >
                  <span className="mr-1" aria-hidden>
                    {emoji}
                  </span>
                  {label}
                </button>
                {showInlineClear ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDatePreset('all');
                      setCustomRange({ dateFrom: '', dateTo: '' });
                    }}
                    aria-label={`清除${label}筛选`}
                    className="rounded-r-full bg-kraft pl-1 pr-2 text-sm text-paper/75 hover:text-paper dark:bg-kraft-light dark:text-ink/60 dark:hover:text-ink"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          })}
          <div
            className={
              'flex w-full sm:ml-auto sm:w-auto sm:min-w-[10rem] sm:flex-1 items-center gap-1.5 sm:gap-2 rounded-full border px-3 py-1 transition-colors ' +
              (locationFilter
                ? 'border-kraft/60 bg-kraft/10 dark:border-paper/30 dark:bg-paper/10'
                : 'border-kraft/30 bg-paper/70 dark:border-paper/15 dark:bg-paper/5')
            }
          >
            <span className="text-sm text-kraft-dark dark:text-kraft-light">📍</span>
            <input
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              {...locationIme}
              placeholder="地点 (北京 / 海边)"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/30 dark:placeholder:text-paper/35 dark:text-paper"
            />
            {locationFilter ? (
              <button
                type="button"
                onClick={() => setLocationFilter('')}
                className="grid h-5 w-5 place-items-center rounded-full bg-kraft/20 text-xs text-ink/60 hover:bg-kraft/40 hover:text-ink dark:bg-paper/20 dark:text-paper/70 dark:hover:bg-paper/30 dark:hover:text-paper"
                aria-label="清空地点筛选"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={
            'mt-2 flex items-center gap-1.5 sm:gap-2 rounded-full border px-3 py-1 transition-colors ' +
            (titleFilter
              ? 'border-kraft/60 bg-kraft/10 dark:border-paper/30 dark:bg-paper/10'
              : 'border-kraft/30 bg-paper/70 dark:border-paper/15 dark:bg-paper/5')
          }
        >
          <span aria-hidden className="text-sm text-kraft-dark dark:text-kraft-light">
            🔎
          </span>
          <input
            value={titleFilter}
            onChange={(e) => setTitleFilter(e.target.value)}
            {...titleIme}
            placeholder="按集合名搜索 (周末 / 生日 …)"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/30 dark:placeholder:text-paper/35 dark:text-paper"
            aria-label="按集合名搜索"
          />
          {titleFilter ? (
            <button
              type="button"
              onClick={() => setTitleFilter('')}
              className="grid h-5 w-5 place-items-center rounded-full bg-kraft/20 text-xs text-ink/60 hover:bg-kraft/40 hover:text-ink dark:bg-paper/20 dark:text-paper/70 dark:hover:bg-paper/30 dark:hover:text-paper"
              aria-label="清空名称搜索"
            >
              ×
            </button>
          ) : null}
        </div>

        <Collapse show={datePreset === 'custom'}>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kraft/20 pt-3 dark:border-paper/15">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/45 dark:text-paper/50">
              Range
            </span>
            <input
              type="date"
              value={customRange.dateFrom}
              onChange={(e) =>
                setCustomRange((v) => ({ ...v, dateFrom: e.target.value }))
              }
              className="rounded border border-kraft/25 bg-paper/80 px-2 py-1 text-sm outline-none focus:border-kraft dark:border-paper/20 dark:bg-paper/10 dark:text-paper"
            />
            <span className="text-ink/35 dark:text-paper/45">→</span>
            <input
              type="date"
              value={customRange.dateTo}
              onChange={(e) =>
                setCustomRange((v) => ({ ...v, dateTo: e.target.value }))
              }
              className="rounded border border-kraft/25 bg-paper/80 px-2 py-1 text-sm outline-none focus:border-kraft dark:border-paper/20 dark:bg-paper/10 dark:text-paper"
            />
          </div>
        </Collapse>

        <Collapse show={locationSuggestions.length > 0}>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {locationSuggestions.map((loc) => (
                <motion.button
                  layout
                  key={loc}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  type="button"
                  onClick={() => setLocationFilter(loc)}
                  className={
                    locationFilter === loc
                      ? 'rounded-full bg-pin-blue/80 px-2.5 py-0.5 text-xs text-paper'
                      : 'rounded-full bg-kraft/10 px-2.5 py-0.5 text-xs text-ink/60 hover:bg-kraft/20 hover:text-ink dark:bg-paper/10 dark:text-paper/65 dark:hover:bg-paper/20'
                  }
                >
                  {loc}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </Collapse>
      </section>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <motion.div
            animate={{ rotate: [-8, 8, -8] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl mb-3"
            aria-hidden
          >
            {hasFilters ? '🔍' : '📭'}
          </motion.div>
          <HandwrittenText className="text-3xl block">
            {hasFilters ? '没有筛到回忆' : '空相册'}
          </HandwrittenText>
          <p className="mt-4 text-ink/60 dark:text-paper/60">
            {hasFilters ? (
              '换个时间或地点再试试 🗺️'
            ) : (
              <>
                还没有任何回忆。{' '}
                <Link
                  to="/upload"
                  className="text-kraft-dark underline underline-offset-4 dark:text-kraft-light"
                >
                  上传第一个集合 📸
                </Link>
                。
              </>
            )}
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          <MobileTimelineList items={items} />
          <DesktopTimelineList items={items} />
        </>
      ) : null}
      <div ref={sentinelRef} className="h-12" />
      {q.isFetchingNextPage ? (
        <p className="text-center text-ink/50 dark:text-paper/55 text-sm">
          正在翻下一页...
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Mobile list ───────────────────────── */

/**
 * Mobile timeline. Same "left rail + dot + card" feel as desktop but in a
 * single column with the rail pinned to the left margin. This gives phones
 * a real chronological reading rhythm instead of a flat 2-up grid.
 */
function MobileTimelineList({ items }: { items: CollectionSummaryDTO[] }) {
  const olRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress: olProgress } = useScroll({
    target: olRef,
    offset: ['start 80%', 'end 20%'],
  });
  const lineScale = useSpring(olProgress, {
    stiffness: 60,
    damping: 20,
    mass: 0.6,
  });

  return (
    <div className="relative sm:hidden pl-6">
      {/* Animated left rail */}
      <motion.div
        aria-hidden
        style={{ scaleY: lineScale, transformOrigin: 'top' }}
        className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-kraft via-kraft/70 to-kraft/0 dark:from-kraft-light dark:via-kraft-light/70"
      />
      {/* Dotted ghost rail */}
      <div
        aria-hidden
        className="absolute left-2 top-2 bottom-2 w-px opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(180deg, currentColor 0%, currentColor 60%, transparent 60%, transparent 100%)',
          backgroundSize: '1px 10px',
          color: '#a88a5c',
        }}
      />

      <ol ref={olRef} className="space-y-6">
        {items.map((c, idx) => (
          <MobileTimelineCard key={c.id} c={c} idx={idx} />
        ))}
      </ol>
    </div>
  );
}

function MobileTimelineCard({
  c,
  idx,
}: {
  c: CollectionSummaryDTO;
  idx: number;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 95%', 'end 5%'],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    mass: 0.5,
  });
  const y = useTransform(smooth, [0, 0.5, 1], [30, 0, -10]);
  const opacity = useTransform(smooth, [0, 0.18, 0.9, 1], [0, 1, 1, 0.75]);
  // Tiny scale pulse to keep cards lively while scrolling
  const cardScale = useTransform(smooth, [0, 0.4, 0.6, 1], [0.97, 1, 1, 0.98]);
  const dotScale = useTransform(smooth, [0.25, 0.5, 0.75], [1, 1.5, 1]);
  const dotShadow = useTransform(
    smooth,
    [0.25, 0.5, 0.75],
    [
      '0 0 0 0 rgba(168,138,92,0)',
      '0 0 0 5px rgba(168,138,92,0.25)',
      '0 0 0 0 rgba(168,138,92,0)',
    ]
  );

  return (
    <motion.li
      ref={ref}
      style={{ y, opacity }}
      transition={{
        delay: 0.03 * Math.min(idx, 6),
        ease: 'easeOut',
      }}
      className="relative"
    >
      {/* Pulsing dot pinned to the left rail (rail sits at x=8px from
          MobileTimelineList; the parent ul has pl-6 so its inner edge is at
          24px; placing the dot at -left-4 nudges its center exactly onto
          the rail, regardless of card width). */}
      <motion.span
        aria-hidden
        style={{ scale: dotScale, boxShadow: dotShadow, x: '-50%' }}
        className="absolute -left-4 top-3 w-3 h-3 rounded-full bg-kraft border-[3px] border-paper dark:border-ink-deep dark:bg-kraft-light"
      />
      <motion.div style={{ scale: cardScale }}>
        <Link to={`/c/${c.id}`} className="block">
          <p className="font-mono text-[10px] uppercase tracking-widest text-ink/55 dark:text-paper/55 mb-1">
            {formatOccurred(c.occurredOn, c.occurredUntil)}
            {c.location ? (
              <>
                <span className="mx-1 text-ink/30 dark:text-paper/35">·</span>
                <span className="italic font-serif text-ink/60 dark:text-paper/65 normal-case tracking-normal">
                  {c.location}
                </span>
              </>
            ) : null}
          </p>
          <div className="relative">
            <StackedPolaroid
              photos={previewStack(c)}
              alt={c.title}
              tiltSeed={c.id}
              aspectRatio={4 / 3}
            />
            {c.photoCount > 1 ? (
              <span
                aria-label={`共 ${c.photoCount} 张照片`}
                className="absolute -bottom-1 right-2 z-20 rounded-full bg-ink/85 px-2 py-0.5 font-mono text-[10px] tracking-wide text-paper shadow-sm dark:bg-paper/15 dark:text-paper"
              >
                📷 {c.photoCount}
              </span>
            ) : null}
          </div>
          <HandwrittenText
            as="h2"
            className="block text-2xl leading-tight mt-2 line-clamp-2"
          >
            {c.title}
          </HandwrittenText>
          {c.tags.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {c.tags.slice(0, 4).map((t) => (
                <span
                  key={t.id}
                  className="font-hand text-xs px-2 py-0.5 rounded-full bg-pin-yellow/25 text-ink/75 dark:bg-paper/15 dark:text-paper/85"
                >
                  {t.displayName}
                </span>
              ))}
              {c.tags.length > 4 ? (
                <span className="font-mono text-[10px] text-ink/45 self-center dark:text-paper/55">
                  +{c.tags.length - 4}
                </span>
              ) : null}
            </div>
          ) : null}
        </Link>
      </motion.div>
    </motion.li>
  );
}

/* ───────────────────────── Desktop list ───────────────────────── */

function DesktopTimelineList({ items }: { items: CollectionSummaryDTO[] }) {
  const olRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress: olProgress } = useScroll({
    target: olRef,
    offset: ['start 70%', 'end 30%'],
  });
  const lineScale = useSpring(olProgress, {
    stiffness: 60,
    damping: 20,
    mass: 0.6,
  });

  return (
    <div className="hidden sm:block relative">
      {/* Animated central timeline line */}
      <motion.div
        aria-hidden
        // NOTE: framer-motion takes over `transform` once we set any motion
        // value, which clobbers Tailwind's `-translate-x-1/2`. Express the
        // horizontal centering via the motion `x` prop instead.
        style={{ scaleY: lineScale, transformOrigin: 'top', x: '-50%' }}
        className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-kraft via-kraft/70 to-kraft/0 dark:from-kraft-light dark:via-kraft-light/70"
      />
      {/* Dotted ghost line behind it for paper feel */}
      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(180deg, currentColor 0%, currentColor 60%, transparent 60%, transparent 100%)',
          backgroundSize: '1px 12px',
          color: '#a88a5c',
        }}
      />

      <ol ref={olRef} className="relative space-y-16">
        {items.map((c, idx) => (
          <DesktopTimelineCard key={c.id} c={c} idx={idx} />
        ))}
      </ol>
    </div>
  );
}

function DesktopTimelineCard({
  c,
  idx,
}: {
  c: CollectionSummaryDTO;
  idx: number;
}) {
  const side: 'left' | 'right' = idx % 2 === 0 ? 'left' : 'right';
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 22,
    mass: 0.6,
  });

  // Vertical parallax: comes up from below, drifts up as it leaves
  const y = useTransform(smooth, [0, 0.5, 1], [70, 0, -40]);
  // Side parallax: small horizontal slide toward the center as it enters
  const xMag = 28;
  const x = useTransform(
    smooth,
    [0, 0.5, 1],
    side === 'left' ? [-xMag, 0, xMag * 0.3] : [xMag, 0, -xMag * 0.3]
  );
  const opacity = useTransform(smooth, [0, 0.18, 0.8, 1], [0, 1, 1, 0.55]);
  const rotate = useTransform(
    smooth,
    [0, 0.5, 1],
    side === 'left' ? [-3, 0, 2] : [3, 0, -2]
  );
  // The dot pulses while the card is within the central reading band
  const dotScale = useTransform(smooth, [0.3, 0.5, 0.7], [1, 1.7, 1]);
  const dotShadow = useTransform(
    smooth,
    [0.3, 0.5, 0.7],
    [
      '0 0 0 0 rgba(168,138,92,0)',
      '0 0 0 6px rgba(168,138,92,0.25)',
      '0 0 0 0 rgba(168,138,92,0)',
    ]
  );

  return (
    <motion.li
      ref={ref}
      style={{ y, opacity }}
      className={
        'relative flex ' +
        (side === 'left' ? 'justify-start' : 'justify-end')
      }
    >
      <motion.span
        aria-hidden
        // See note on the timeline line: keep the centering inside the
        // motion transform so the scale animation doesn't override it.
        style={{ scale: dotScale, boxShadow: dotShadow, x: '-50%' }}
        className="absolute left-1/2 top-8 w-3 h-3 rounded-full bg-kraft border-[3px] border-paper dark:border-ink-deep dark:bg-kraft-light"
      />
      <motion.div
        style={{ x, rotate }}
        className={'w-[44%] ' + (side === 'left' ? 'pr-8' : 'pl-8')}
      >
        <Link to={`/c/${c.id}`} className="block">
          <div className="relative">
            <StackedPolaroid
              photos={previewStack(c)}
              alt={c.title}
              tiltSeed={c.id}
              topLayoutId={`cover-${c.id}`}
              aspectRatio={4 / 3}
            />
            {c.photoCount > 1 ? (
              <span
                aria-label={`共 ${c.photoCount} 张照片`}
                className="absolute -bottom-2 right-3 z-20 rounded-full bg-ink/85 px-2.5 py-0.5 font-mono text-xs tracking-wide text-paper shadow-sm dark:bg-paper/15 dark:text-paper"
              >
                📷 {c.photoCount}
              </span>
            ) : null}
          </div>
          <DesktopCardMeta c={c} smooth={smooth} />
        </Link>
      </motion.div>
    </motion.li>
  );
}

function DesktopCardMeta({
  c,
  smooth,
}: {
  c: CollectionSummaryDTO;
  smooth: MotionValue<number>;
}) {
  const titleY = useTransform(smooth, [0, 0.4, 1], [12, 0, -8]);
  return (
    <motion.div style={{ y: titleY }} className="mt-3 px-1">
      <p className="font-mono text-xs uppercase tracking-widest text-ink/50 dark:text-paper/55">
        {formatOccurred(c.occurredOn, c.occurredUntil)}
      </p>
      <HandwrittenText
        as="h2"
        className="text-2xl block leading-tight mt-1"
      >
        {c.title}
      </HandwrittenText>
      {c.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2 mt-3">
          {c.tags.slice(0, 4).map((t) => (
            <TapeBadge key={t.id} tiltSeed={`${c.id}-${t.id}`}>
              {t.displayName}
            </TapeBadge>
          ))}
        </div>
      ) : null}
      {c.location ? (
        <p className="font-serif text-sm text-ink/60 mt-3 italic dark:text-paper/60">
          · {c.location}
        </p>
      ) : null}
    </motion.div>
  );
}
