import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTags } from '@/hooks/useTags';
import { TapeBadge } from '@/components/scrapbook/TapeBadge';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { PageHero } from '@/components/scrapbook/PageHero';
import type { TagDTO } from '@daynest/shared';

type ViewMode = 'hot' | 'cloud' | 'group';
/**
 * Which tag-source the overview is restricted to.
 *   - 'any'        : everything (default)
 *   - 'collection' : only tags that label a collection at collection-level
 *   - 'photo'      : only tags that label at least one photo
 *
 * The split lets users browse "the tags I put on whole memories" vs
 * "the tags I sprinkled on individual photos", which carry slightly
 * different intent (the former are like album titles, the latter are
 * more like sticky notes).
 */
type ScopeMode = 'any' | 'collection' | 'photo';

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string; emoji: string }> = [
  { id: 'hot', label: '热门', emoji: '🔥' },
  { id: 'cloud', label: '平铺', emoji: '🌫️' },
  { id: 'group', label: '分组', emoji: '🗂️' },
];

const SCOPE_OPTIONS: Array<{ id: ScopeMode; label: string; emoji: string }> = [
  { id: 'any', label: '全部', emoji: '🌐' },
  { id: 'collection', label: '集合', emoji: '📚' },
  { id: 'photo', label: '照片', emoji: '🖼️' },
];

function tagTotalCount(t: TagDTO): number {
  return (t.collectionCount ?? 0) + (t.photoCount ?? 0);
}

function tagScopedCount(t: TagDTO, scope: ScopeMode): number {
  if (scope === 'collection') return t.collectionCount ?? 0;
  if (scope === 'photo') return t.photoCount ?? 0;
  return tagTotalCount(t);
}

function tagInitial(t: TagDTO): string {
  const raw = (t.displayName || t.name).trim();
  if (!raw) return '#';
  const ch = raw[0]!;
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return '#';
  // CJK / emoji / other — bucket the first grapheme directly
  return ch;
}

export function TagsOverviewPage() {
  const q = useTags();
  const [mode, setMode] = useState<ViewMode>('hot');
  const [scope, setScope] = useState<ScopeMode>('any');

  const allTags = q.data ?? [];
  // Restrict the tag list to those that actually appear in the chosen
  // scope. A tag with photoCount=0 wouldn't have anything to show in
  // 'photo' scope, so we drop it (rather than leave a dead-end link).
  const tags = useMemo(
    () => allTags.filter((t) => tagScopedCount(t, scope) > 0),
    [allTags, scope]
  );

  // For tag cloud: compute font-size scale based on the scoped count.
  const maxCount = useMemo(
    () => tags.reduce((m, t) => Math.max(m, tagScopedCount(t, scope)), 0),
    [tags, scope]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, TagDTO[]>();
    for (const t of tags) {
      const key = tagInitial(t);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([key, arr]) => ({
        key,
        items: arr.sort(
          (a, b) => tagScopedCount(b, scope) - tagScopedCount(a, scope)
        ),
      }))
      .sort((a, b) => {
        // Letters first, then digits/#, then CJK by codepoint
        const aLetter = /^[A-Z]$/.test(a.key);
        const bLetter = /^[A-Z]$/.test(b.key);
        if (aLetter && !bLetter) return -1;
        if (!aLetter && bLetter) return 1;
        if (a.key === '#') return 1;
        if (b.key === '#') return -1;
        return a.key.localeCompare(b.key, 'zh-Hans-CN');
      });
  }, [tags, scope]);

  if (q.isLoading) {
    return (
      <div className="text-center text-ink/60 dark:text-paper/60 py-16">
        正在整理标签...
      </div>
    );
  }

  // Empty state — distinguish "truly no tags" from "no tags in this scope".
  if (tags.length === 0) {
    const truly = allTags.length === 0;
    return (
      <div className="pb-24">
        <PageHero
          emoji="🏷️"
          title="标签"
          subtitle={`TAGS · ${allTags.length} TOTAL`}
          motion="wobble"
          className="pb-6"
        />
        <ScopeToggle scope={scope} setScope={setScope} />
        <div className="text-center py-12">
          <motion.div
            animate={{ rotate: [-6, 6, -6] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl mb-3"
            aria-hidden
          >
            🏷️
          </motion.div>
          <HandwrittenText className="text-3xl block">
            {truly ? '还没有标签' : '当前视角下没有标签'}
          </HandwrittenText>
          <p className="mt-3 text-ink/60 dark:text-paper/60 text-sm">
            {truly
              ? '上传照片时给它们打几个标签吧 🎨'
              : '换个分类看看？'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <PageHero
        emoji="🏷️"
        title="标签"
        subtitle={`TAGS · ${tags.length} / ${allTags.length}`}
        motion="wobble"
        className="pb-6"
      />

      <ScopeToggle scope={scope} setScope={setScope} />

      {/* View mode toggle */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-kraft/25 bg-paper/70 p-1 shadow-sm dark:border-paper/15 dark:bg-paper/5">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setMode(v.id)}
              className={
                mode === v.id
                  ? 'rounded-full bg-kraft px-3 py-1 text-sm text-paper shadow-sm dark:bg-kraft-light dark:text-ink'
                  : 'rounded-full px-3 py-1 text-sm text-ink/65 hover:text-ink dark:text-paper/65 dark:hover:text-paper'
              }
            >
              <span className="mr-1" aria-hidden>
                {v.emoji}
              </span>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'hot' ? (
          <motion.div
            key="hot"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <HotView tags={tags} scope={scope} />
          </motion.div>
        ) : mode === 'cloud' ? (
          <motion.div
            key="cloud"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <CloudView tags={tags} scope={scope} maxCount={maxCount} />
          </motion.div>
        ) : (
          <motion.div
            key="group"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <GroupView grouped={grouped} scope={scope} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Build the tag-detail href, propagating the active scope so the pinboard
 * filters to the same source. `any` is omitted because it's the default.
 */
function tagHref(t: TagDTO, scope: ScopeMode): string {
  const base = `/tags/${encodeURIComponent(t.name)}`;
  return scope === 'any' ? base : `${base}?scope=${scope}`;
}

function ScopeToggle({
  scope,
  setScope,
}: {
  scope: ScopeMode;
  setScope: (s: ScopeMode) => void;
}) {
  return (
    <div className="mb-4 flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-full border border-kraft/20 bg-paper/60 p-0.5 shadow-sm dark:border-paper/15 dark:bg-paper/5">
        {SCOPE_OPTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={
              scope === s.id
                ? 'rounded-full bg-pin-yellow/80 px-3 py-0.5 text-xs text-ink/85 shadow-sm dark:bg-paper/15 dark:text-paper'
                : 'rounded-full px-3 py-0.5 text-xs text-ink/55 hover:text-ink dark:text-paper/55 dark:hover:text-paper'
            }
            aria-pressed={scope === s.id}
          >
            <span className="mr-1" aria-hidden>
              {s.emoji}
            </span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HotView({ tags, scope }: { tags: TagDTO[]; scope: ScopeMode }) {
  const sorted = [...tags].sort(
    (a, b) => tagScopedCount(b, scope) - tagScopedCount(a, scope)
  );
  const hot = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  return (
    <>
      <section className="mb-10">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 dark:text-paper/60 mb-3">
          🔥 热门
        </h2>
        <div className="flex flex-wrap gap-3">
          {hot.map((t) => (
            <Link key={t.id} to={tagHref(t, scope)}>
              <TapeBadge tiltSeed={t.id}>
                {t.displayName}
                <span className="ml-2 text-xs font-mono opacity-70">
                  {tagScopedCount(t, scope)}
                </span>
              </TapeBadge>
            </Link>
          ))}
        </div>
      </section>

      {rest.length > 0 ? (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 dark:text-paper/60 mb-3">
            ✨ 其他
          </h2>
          <div className="flex flex-wrap gap-2">
            {rest.map((t) => (
              <Link
                key={t.id}
                to={tagHref(t, scope)}
                className="px-2 py-1 text-sm text-ink/70 hover:text-ink hover:bg-paper-dark/40 rounded transition-colors dark:text-paper/70 dark:hover:text-paper dark:hover:bg-paper/10"
              >
                {t.displayName}
                <span className="ml-1 text-xs text-ink/40 dark:text-paper/40">
                  {tagScopedCount(t, scope)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function CloudView({
  tags,
  scope,
  maxCount,
}: {
  tags: TagDTO[];
  scope: ScopeMode;
  maxCount: number;
}) {
  // Sort alphabetically for the cloud so popular tags don't all bunch at top.
  // Then scale font-size 12..28 based on count.
  const sorted = [...tags].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'zh-Hans-CN')
  );
  return (
    <section>
      <p className="mb-4 text-center font-hand text-base text-ink/55 dark:text-paper/55">
        🌫️ 字号 = 使用频率
      </p>
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-2 px-2">
        {sorted.map((t) => {
          const count = tagScopedCount(t, scope);
          const scale = maxCount > 0 ? count / maxCount : 0;
          const fontSize = 12 + Math.round(scale * 18); // 12..30px
          const opacity = 0.45 + scale * 0.55;
          return (
            <Link
              key={t.id}
              to={tagHref(t, scope)}
              style={{ fontSize, opacity }}
              className="font-hand text-kraft-dark hover:text-pin-red transition-colors dark:text-kraft-light dark:hover:text-pin-red"
            >
              {t.displayName}
              {count > 0 ? (
                <span
                  className="ml-1 align-baseline font-mono text-ink/40 dark:text-paper/40"
                  style={{ fontSize: Math.max(10, fontSize * 0.55) }}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function GroupView({
  grouped,
  scope,
}: {
  grouped: Array<{ key: string; items: TagDTO[] }>;
  scope: ScopeMode;
}) {
  return (
    <div className="space-y-8">
      {grouped.map(({ key, items }) => (
        <section key={key} className="flex gap-4">
          <div className="w-12 shrink-0 text-right">
            <span className="inline-block rounded bg-kraft/20 px-2 py-1 font-mono text-sm text-kraft-dark dark:bg-paper/10 dark:text-paper/75">
              {key}
            </span>
            <p className="mt-1 font-mono text-[10px] text-ink/40 dark:text-paper/45">
              {items.length}
            </p>
          </div>
          <div className="flex flex-1 flex-wrap gap-2 pt-1">
            {items.map((t) => (
              <Link
                key={t.id}
                to={tagHref(t, scope)}
                className="inline-flex items-center gap-1 rounded-full border border-kraft/20 bg-paper/60 px-3 py-1 text-sm text-ink/75 hover:border-kraft hover:bg-paper hover:text-ink dark:border-paper/15 dark:bg-paper/5 dark:text-paper/75 dark:hover:bg-paper/15 dark:hover:text-paper"
              >
                <span>{t.displayName}</span>
                <span className="font-mono text-[10px] text-ink/40 dark:text-paper/45">
                  {tagScopedCount(t, scope)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
