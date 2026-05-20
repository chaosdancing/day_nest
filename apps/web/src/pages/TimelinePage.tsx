import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useCollections } from '@/hooks/useCollections';
import { Polaroid } from '@/components/scrapbook/Polaroid';
import { TapeBadge } from '@/components/scrapbook/TapeBadge';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';

const MONTH_LABELS = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];

function formatOccurred(occurredOn: string, occurredUntil: string | null) {
  const start = new Date(occurredOn);
  const startStr = `${start.getFullYear()}年${MONTH_LABELS[start.getMonth()]}月${start.getDate()}日`;
  if (!occurredUntil) return startStr;
  const end = new Date(occurredUntil);
  if (start.toDateString() === end.toDateString()) return startStr;
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${startStr} – ${end.getDate()}日`;
  }
  return `${startStr} – ${end.getFullYear()}年${MONTH_LABELS[end.getMonth()]}月${end.getDate()}日`;
}

export function TimelinePage() {
  const q = useCollections({ limit: 20 });
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

  if (q.isLoading) {
    return <div className="text-center text-ink/60 py-16">正在翻开相册...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <HandwrittenText className="text-3xl block">空相册</HandwrittenText>
        <p className="mt-4 text-ink/60">
          还没有任何回忆。{' '}
          <Link to="/upload" className="text-kraft-dark underline underline-offset-4">
            上传第一个集合
          </Link>
          。
        </p>
      </div>
    );
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

      <div
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 top-32 bottom-0 w-px"
        style={{
          backgroundImage:
            'linear-gradient(180deg, #a88a5c 0%, #a88a5c 60%, transparent 60%, transparent 100%)',
          backgroundSize: '1px 12px',
        }}
      />

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
      <div ref={sentinelRef} className="h-12" />
      {q.isFetchingNextPage ? (
        <p className="text-center text-ink/50 text-sm">正在翻下一页...</p>
      ) : null}
    </div>
  );
}
