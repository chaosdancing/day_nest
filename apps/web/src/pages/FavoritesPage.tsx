import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useFavorites, type FavoritesScope } from '@/hooks/useFavorites';
import { FavoriteHeart } from '@/components/scrapbook/FavoriteHeart';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { PageHero } from '@/components/scrapbook/PageHero';
import { deterministicTilt } from '@/lib/deterministicTilt';
import type { FavoriteEntryDTO } from '@daynest/shared';

function formatActor(a: FavoriteEntryDTO['favoritedBy'][number]) {
  const when = new Date(a.createdAt);
  const m = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  return `${a.displayName || a.username} · ${when.getFullYear()}.${m}.${d}`;
}

export function FavoritesPage() {
  const [scope, setScope] = useState<FavoritesScope>('all');
  const q = useFavorites(scope);
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

  return (
    <div className="relative pb-24">
      <PageHero
        emoji="💖"
        title="最爱"
        subtitle={`FAVORITES · ${items.length} ${items.length === 1 ? 'STAMP' : 'STAMPS'}`}
        emojiClassName="text-pin-red"
        motion="bounce"
        className="pb-10"
      />

      {/* Scope switch — mirrors the mini-app: the shared family wall vs. mine. */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-full bg-ink/5 p-1 dark:bg-paper/10">
          {(
            [
              { key: 'all', label: '全家最爱' },
              { key: 'mine', label: '只看我的' },
            ] as { key: FavoritesScope; label: string }[]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setScope(opt.key)}
              className={`rounded-full px-5 py-1.5 text-sm font-semibold transition ${
                scope === opt.key
                  ? 'bg-kraft text-paper shadow-sm'
                  : 'text-ink/55 hover:text-ink/80 dark:text-paper/55 dark:hover:text-paper/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-center text-ink/60 dark:text-paper/60 py-16">
          正在翻心愿盒...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl mb-3"
            aria-hidden
          >
            🤍
          </motion.div>
          <HandwrittenText className="text-3xl block">
            {scope === 'mine' ? '你还没有最爱' : '还没有最爱'}
          </HandwrittenText>
          <p className="mt-4 text-ink/60 dark:text-paper/60">
            打开{' '}
            <Link to="/" className="text-kraft-dark underline underline-offset-4 dark:text-kraft-light">
              时光轴
            </Link>{' '}
            ，点照片左上角的小心心 ♡ 收藏起来。
          </p>
        </div>
      ) : (
        <ul
          className="grid gap-4 sm:gap-6"
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(160px, 100%), 1fr))',
          }}
        >
          {items.map((entry, idx) => (
            <motion.li
              key={entry.photo.id}
              initial={{ opacity: 0, y: 30, rotate: 0 }}
              animate={{
                opacity: 1,
                y: 0,
                rotate: deterministicTilt(entry.photo.id, 3),
              }}
              transition={{
                delay: 0.05 * Math.min(idx, 10),
                duration: 0.5,
                ease: 'easeOut',
              }}
              whileHover={{ rotate: 0, y: -4, scale: 1.03 }}
              className="relative"
            >
              <Link
                to={`/c/${entry.collection.id}/p/${entry.photo.orderIndex}`}
                className="block"
              >
                <div className="relative bg-white dark:bg-ink/85 p-2 pb-3 shadow-polaroid hover:shadow-polaroid-hover transition-shadow">
                  <div
                    className="overflow-hidden"
                    style={{
                      aspectRatio: `${entry.photo.width} / ${entry.photo.height}`,
                    }}
                  >
                    <img
                      src={entry.photo.thumbnailUrl}
                      alt={entry.photo.caption ?? entry.collection.title}
                      loading="lazy"
                      className="block h-full w-full object-cover"
                    />
                  </div>
                  <div className="absolute top-1 right-1">
                    <FavoriteHeart
                      photoId={entry.photo.id}
                      collectionId={entry.collection.id}
                      favorited={entry.photo.favoritedByMe}
                      count={entry.photo.favoriteCount}
                      size="sm"
                      variant="overlay"
                    />
                  </div>
                  <div className="mt-1.5 px-1">
                    <p className="truncate font-hand text-base text-kraft-dark dark:text-paper/90">
                      {entry.collection.title}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-ink/40 dark:text-paper/45">
                      {entry.collection.occurredOn}
                    </p>
                  </div>
                </div>
              </Link>
              <ul className="mt-2 space-y-0.5 px-1">
                {entry.favoritedBy.slice(0, 3).map((actor) => (
                  <li
                    key={actor.userId}
                    className="flex items-center gap-1.5 text-[11px] text-ink/65 dark:text-paper/65"
                  >
                    <span className="text-pin-red text-xs">♥</span>
                    <span className="truncate">{formatActor(actor)}</span>
                  </li>
                ))}
                {entry.favoritedBy.length > 3 ? (
                  <li className="text-[10px] text-ink/45 dark:text-paper/50 font-mono">
                    +{entry.favoritedBy.length - 3} more
                  </li>
                ) : null}
              </ul>
            </motion.li>
          ))}
        </ul>
      )}
      <div ref={sentinelRef} className="h-12" />
      {q.isFetchingNextPage ? (
        <p className="text-center text-ink/50 dark:text-paper/50 text-sm">
          正在翻下一页...
        </p>
      ) : null}
    </div>
  );
}
