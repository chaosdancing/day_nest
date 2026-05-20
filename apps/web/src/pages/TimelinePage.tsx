import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollections } from '@/hooks/useCollections';
import { Polaroid } from '@/components/scrapbook/Polaroid';
import { TapeBadge } from '@/components/scrapbook/TapeBadge';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import {
  buildDatePresetRange,
  type DatePreset,
} from '@/lib/timelineFilters';

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
    location: locationFilter.trim() || undefined,
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
    !!locationFilter.trim();

  if (q.isLoading) {
    return <div className="text-center text-ink/60 py-16">正在翻开相册...</div>;
  }

  return (
    <div className="relative pb-24">
      <div className="text-center pb-8">
        <HandwrittenText as="h1" className="text-5xl block leading-none">
          时间轴
        </HandwrittenText>
        <p className="font-mono text-xs tracking-widest text-ink/50 mt-2">
          TIMELINE · {items.length} ENTRIES
        </p>
      </div>

      <section className="sticky top-[57px] z-20 mb-10 rounded-lg border border-kraft/25 bg-paper/90 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-hand text-xl text-kraft-dark mr-1">
            时空快筛
          </span>
          {[
            ['all', '全部'],
            ['year', '今年'],
            ['quarter', '近90天'],
            ['custom', '自定义'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDatePreset(value as DatePreset)}
              className={
                datePreset === value
                  ? 'rounded-full bg-kraft px-3 py-1 text-sm text-paper shadow-sm'
                  : 'rounded-full border border-kraft/30 bg-paper/70 px-3 py-1 text-sm text-ink/65 hover:border-kraft hover:text-ink'
              }
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex min-w-[14rem] flex-1 items-center gap-2 rounded-full border border-kraft/30 bg-paper/70 px-3 py-1">
            <span className="text-sm text-kraft-dark">📍</span>
            <input
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="筛选地点，例如 北京 / 海边"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/30"
            />
            {locationFilter ? (
              <button
                type="button"
                onClick={() => setLocationFilter('')}
                className="text-ink/40 hover:text-ink"
                aria-label="清空地点筛选"
              >
                ×
              </button>
            ) : null}
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setDatePreset('all');
                setCustomRange({ dateFrom: '', dateTo: '' });
                setLocationFilter('');
              }}
              className="text-xs text-ink/50 underline-offset-4 hover:text-ink hover:underline"
            >
              清空
            </button>
          ) : null}
        </div>

        {datePreset === 'custom' ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-kraft/20 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink/45">
              Range
            </span>
            <input
              type="date"
              value={customRange.dateFrom}
              onChange={(e) =>
                setCustomRange((v) => ({ ...v, dateFrom: e.target.value }))
              }
              className="rounded border border-kraft/25 bg-paper/80 px-2 py-1 text-sm outline-none focus:border-kraft"
            />
            <span className="text-ink/35">→</span>
            <input
              type="date"
              value={customRange.dateTo}
              onChange={(e) =>
                setCustomRange((v) => ({ ...v, dateTo: e.target.value }))
              }
              className="rounded border border-kraft/25 bg-paper/80 px-2 py-1 text-sm outline-none focus:border-kraft"
            />
          </div>
        ) : null}

        {locationSuggestions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {locationSuggestions.map((loc) => (
              <button
                type="button"
                key={loc}
                onClick={() => setLocationFilter(loc)}
                className={
                  locationFilter === loc
                    ? 'rounded-full bg-pin-blue/80 px-2.5 py-0.5 text-xs text-paper'
                    : 'rounded-full bg-kraft/10 px-2.5 py-0.5 text-xs text-ink/60 hover:bg-kraft/20 hover:text-ink'
                }
              >
                {loc}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <HandwrittenText className="text-3xl block">
            {hasFilters ? '没有筛到回忆' : '空相册'}
          </HandwrittenText>
          <p className="mt-4 text-ink/60">
            {hasFilters ? (
              '换个时间或地点再试试。'
            ) : (
              <>
                还没有任何回忆。{' '}
                <Link
                  to="/upload"
                  className="text-kraft-dark underline underline-offset-4"
                >
                  上传第一个集合
                </Link>
                。
              </>
            )}
          </p>
        </div>
      ) : null}

      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 top-72 bottom-0 w-px"
        style={{
          backgroundImage:
            'linear-gradient(180deg, #a88a5c 0%, #a88a5c 60%, transparent 60%, transparent 100%)',
          backgroundSize: '1px 12px',
        }}
      />

      {items.length > 0 ? (
      <ol className="space-y-12 sm:space-y-16">
        {items.map((c, idx) => {
          const side = idx % 2 === 0 ? 'left' : 'right';
          return (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -100px 0px' }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={
                'relative flex ' + (side === 'left' ? 'justify-start' : 'justify-end')
              }
            >
              <span
                aria-hidden
                className="hidden sm:block absolute left-1/2 -translate-x-1/2 top-8 w-3 h-3 rounded-full bg-kraft border-[3px] border-paper"
              />
              <Link
                to={`/c/${c.id}`}
                className={
                  'block w-full sm:w-[44%] ' +
                  (side === 'left' ? 'sm:pr-8' : 'sm:pl-8')
                }
              >
                <Polaroid
                  src={c.coverPhoto?.thumbnailUrl ?? ''}
                  alt={c.title}
                  tiltSeed={c.id}
                  layoutId={`cover-${c.id}`}
                  aspectRatio={4 / 3}
                />
                <div className="mt-3 px-1">
                  <p className="font-mono text-xs uppercase tracking-widest text-ink/50">
                    {formatOccurred(c.occurredOn, c.occurredUntil)}
                  </p>
                  <HandwrittenText as="h2" className="text-2xl block leading-tight mt-1">
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
                    <p className="font-serif text-sm text-ink/60 mt-3 italic">
                      · {c.location}
                    </p>
                  ) : null}
                </div>
              </Link>
            </motion.li>
          );
        })}
      </ol>
      ) : null}
      <div ref={sentinelRef} className="h-12" />
      {q.isFetchingNextPage ? (
        <p className="text-center text-ink/50 text-sm">正在翻下一页...</p>
      ) : null}
    </div>
  );
}
