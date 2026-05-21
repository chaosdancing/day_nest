import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type WheelEvent,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue } from 'framer-motion';
import { useCollections, type TagScope } from '@/hooks/useCollections';
import { useRenameTag } from '@/hooks/useTags';
import { StackedPolaroid } from '@/components/scrapbook/StackedPolaroid';
import { Pin } from '@/components/scrapbook/Pin';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { deterministicTilt } from '@/lib/deterministicTilt';

const BOARD_WIDTH = 2200;
const BOARD_HEIGHT = 1600;
const CARD_WIDTH = 200;
const PIN_COLORS: Array<'red' | 'blue' | 'yellow' | 'green'> = [
  'red',
  'blue',
  'yellow',
  'green',
];

function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Cluster items around the board center using a golden-angle spiral so
 * earlier items live near the middle and later ones spread outward in a
 * natural-looking pattern. Each item gets a deterministic jitter for that
 * scrapbook randomness.
 */
function spiralPosition(
  seed: string,
  idx: number
): { x: number; y: number } {
  const cx = BOARD_WIDTH / 2;
  const cy = BOARD_HEIGHT / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5°
  const angle = idx * goldenAngle + (hash(seed) % 360) * (Math.PI / 180);
  const radius = 70 + Math.sqrt(idx) * 110;
  const jitterX = ((hash(`${seed}-jx-${idx}`) % 80) - 40);
  const jitterY = ((hash(`${seed}-jy-${idx}`) % 80) - 40);
  return {
    x: cx + Math.cos(angle) * radius + jitterX - CARD_WIDTH / 2,
    y: cy + Math.sin(angle) * radius + jitterY - CARD_WIDTH * 0.4,
  };
}

type RenameNavState = { renameNotice?: string };

/**
 * Parse `?scope=` off the current URL. Anything outside the known set
 * falls back to 'any' so a stale link or hand-mangled URL doesn't break
 * the page; defaulting to the broadest scope is the friendlier choice.
 */
function parseScope(search: string): TagScope {
  const raw = new URLSearchParams(search).get('scope');
  if (raw === 'collection' || raw === 'photo' || raw === 'any') return raw;
  return 'any';
}

const SCOPE_LABEL: Record<TagScope, string> = {
  any: '全部',
  collection: '集合标签',
  photo: '照片标签',
};

export function TagPinboardPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const tagName = decodeURIComponent(name ?? '');
  const scope = parseScope(location.search);
  const q = useCollections({ tag: tagName, tagScope: scope, limit: 50 });
  const renameTag = useRenameTag();
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [centered, setCentered] = useState(false);

  // Inline rename state for the title header.
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(tagName);
  const [renameNotice, setRenameNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Whenever the URL tag changes, reset our local draft + collapse the
  // editor; otherwise switching tags would carry over a stale value.
  useEffect(() => {
    setDraftName(tagName);
    setEditing(false);
    setRenameNotice(null);
  }, [tagName]);

  // After a rename navigates here with a notice in router state, surface
  // it once and then strip the state so a future back/forward doesn't
  // resurrect the same toast.
  useEffect(() => {
    const stateNotice = (location.state as RenameNavState | null)?.renameNotice;
    if (!stateNotice) return;
    setRenameNotice(stateNotice);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = async () => {
    const next = draftName.trim();
    if (next.length === 0 || next === tagName) {
      setEditing(false);
      setDraftName(tagName);
      return;
    }
    try {
      const result = await renameTag.mutateAsync({
        currentName: tagName,
        displayName: next,
      });
      setEditing(false);
      const notice = result.merged
        ? `已与既有标签「${result.displayName}」合并`
        : undefined;
      // The canonical (lowercased) name is what URLs use; navigate there
      // so refreshes / back-button still resolve the tag we just renamed.
      // Pipe the toast text via router state so the effect on the next
      // route can surface it after the param change.
      navigate(`/tags/${encodeURIComponent(result.name)}`, {
        replace: true,
        state: notice ? ({ renameNotice: notice } as RenameNavState) : null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '改名失败，稍后再试';
      setRenameNotice(message);
    }
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
      setDraftName(tagName);
    }
  };

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const placed = useMemo(
    () =>
      items.map((c, idx) => ({
        c,
        pos: spiralPosition(tagName, idx),
        pinColor: PIN_COLORS[hash(c.id) % PIN_COLORS.length]!,
      })),
    [items, tagName]
  );

  /**
   * On first mount (and when the tag changes) center the board: translate
   * the inner pannable div so the board's logical center is at the
   * container center.
   */
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw === 0 || ch === 0) return;
    const targetX = cw / 2 - (BOARD_WIDTH * scale) / 2;
    const targetY = ch / 2 - (BOARD_HEIGHT * scale) / 2;
    x.set(targetX);
    y.set(targetY);
    setCentered(true);
  }, [tagName, scale, x, y]);

  /**
   * Re-center if the viewport resizes before the user has dragged anywhere.
   */
  useEffect(() => {
    if (!centered) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      // Only nudge if the user appears to still be near the centered pose.
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const targetX = cw / 2 - (BOARD_WIDTH * scale) / 2;
      const targetY = ch / 2 - (BOARD_HEIGHT * scale) / 2;
      x.set(targetX);
      y.set(targetY);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [centered, scale, x, y]);

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setScale((s) => Math.max(0.5, Math.min(2, s + (e.deltaY < 0 ? 0.08 : -0.08))));
  };

  const recenter = () => {
    const el = containerRef.current;
    if (!el) return;
    const targetX = el.clientWidth / 2 - (BOARD_WIDTH * scale) / 2;
    const targetY = el.clientHeight / 2 - (BOARD_HEIGHT * scale) / 2;
    x.set(targetX);
    y.set(targetY);
  };

  return (
    <div className="pb-12 -mx-4 sm:-mx-6">
      <div className="text-center py-6 px-4">
        <Link
          to="/tags"
          className="text-sm text-ink/60 hover:text-ink dark:text-paper/60 dark:hover:text-paper"
        >
          ← 全部标签
        </Link>
        <motion.div
          animate={{ y: [0, -3, 0], rotate: [-4, 4, -4] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-4xl mt-2"
          aria-hidden
        >
          📌
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          {editing ? (
            <motion.div
              key="editing"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="mt-1 inline-flex items-center gap-2"
            >
              <span
                aria-hidden
                className="font-hand text-3xl sm:text-4xl text-ink/80 dark:text-paper/80"
              >
                #
              </span>
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={onEditKeyDown}
                onBlur={commitRename}
                disabled={renameTag.isPending}
                maxLength={60}
                className="font-hand text-3xl sm:text-4xl bg-transparent border-b-2 border-kraft-dark/40 text-center w-[min(80vw,18rem)] outline-none focus:border-kraft dark:border-paper/30 dark:focus:border-paper/70 dark:text-paper disabled:opacity-60"
                placeholder="标签名"
                aria-label="重命名标签"
              />
            </motion.div>
          ) : (
            <motion.div
              key="reading"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="mt-1 inline-flex items-center gap-2 group"
            >
              <HandwrittenText
                as="h1"
                className="text-4xl sm:text-5xl inline-block"
              >
                # {tagName}
              </HandwrittenText>
              <button
                type="button"
                onClick={() => {
                  setRenameNotice(null);
                  setDraftName(tagName);
                  setEditing(true);
                }}
                aria-label="重命名这个标签"
                title="重命名这个标签"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base text-ink/40 hover:bg-kraft/15 hover:text-ink/70 opacity-70 group-hover:opacity-100 transition dark:text-paper/45 dark:hover:bg-paper/10 dark:hover:text-paper/80"
              >
                ✏️
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="font-mono text-xs text-ink/50 dark:text-paper/55 mt-1">
          {items.length} ENTRIES · {SCOPE_LABEL[scope]} · 🖐️ 拖动平移 · ⌘ + 滚轮缩放
        </p>

        {/* Scope toggle. Skip rendering on the default 'any' scope to
            avoid cluttering the header — but only once the user has
            shown they care about the distinction (i.e., they navigated
            here with ?scope set). They can still narrow further with
            the buttons. */}
        <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-kraft/20 bg-paper/60 p-0.5 shadow-sm dark:border-paper/15 dark:bg-paper/5">
          {(['any', 'collection', 'photo'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                const params = new URLSearchParams(location.search);
                if (s === 'any') params.delete('scope');
                else params.set('scope', s);
                const qs = params.toString();
                navigate(
                  `${location.pathname}${qs ? `?${qs}` : ''}`,
                  { replace: true }
                );
              }}
              className={
                scope === s
                  ? 'rounded-full bg-pin-yellow/80 px-3 py-0.5 text-xs text-ink/85 shadow-sm dark:bg-paper/15 dark:text-paper'
                  : 'rounded-full px-3 py-0.5 text-xs text-ink/55 hover:text-ink dark:text-paper/55 dark:hover:text-paper'
              }
              aria-pressed={scope === s}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {renameNotice && (
            <motion.p
              key="notice"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 inline-block rounded-full bg-kraft/20 px-3 py-0.5 text-xs text-ink/80 dark:bg-paper/10 dark:text-paper/80"
            >
              {renameNotice}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div
        ref={containerRef}
        onWheel={onWheel}
        className="relative overflow-hidden bg-cork-board border-y border-kraft-dark/20"
        style={{ height: '70vh' }}
      >
        <motion.div
          drag
          dragMomentum={false}
          dragConstraints={containerRef}
          dragElastic={0.04}
          style={{
            x,
            y,
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            scale,
            transformOrigin: '0 0',
          }}
          className="absolute touch-pan-x touch-pan-y will-change-transform"
        >
          {placed.map(({ c, pos, pinColor }, idx) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.02 * Math.min(idx, 20),
                duration: 0.4,
                ease: 'easeOut',
              }}
              className="absolute"
              style={{ left: pos.x, top: pos.y, width: CARD_WIDTH }}
            >
              <Link to={`/c/${c.id}`} className="relative block">
                <Pin
                  color={pinColor}
                  className="absolute left-1/2 -translate-x-1/2 -top-1.5 z-20"
                />
                <StackedPolaroid
                  photos={
                    c.previewPhotos.length > 0
                      ? c.previewPhotos.map((p) => ({
                          id: p.id,
                          thumbnailUrl: p.thumbnailUrl,
                        }))
                      : c.coverPhoto
                        ? [
                            {
                              id: c.coverPhoto.id,
                              thumbnailUrl: c.coverPhoto.thumbnailUrl,
                            },
                          ]
                        : []
                  }
                  alt={c.title}
                  tiltSeed={`${tagName}-${c.id}`}
                  tilt={deterministicTilt(`${tagName}-${c.id}`, 6)}
                  caption={c.title}
                  aspectRatio={4 / 3}
                />
                {c.photoCount > c.previewPhotos.length ? (
                  <span
                    aria-hidden
                    className="absolute -bottom-1 right-2 z-20 rounded-full bg-ink/85 px-2 py-0.5 font-mono text-[10px] tracking-wide text-paper shadow-sm dark:bg-paper/15 dark:text-paper"
                  >
                    +{c.photoCount - c.previewPhotos.length}
                  </span>
                ) : null}
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Floating controls (recenter / zoom) */}
        <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-full border border-kraft-dark/30 bg-paper/90 text-ink shadow-sm dark:border-paper/20 dark:bg-ink-deep/80 dark:text-paper">
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2, s + 0.1))}
              className="h-8 w-8 leading-none hover:bg-kraft/15 dark:hover:bg-paper/10"
              aria-label="放大"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
              className="h-8 w-8 border-t border-kraft-dark/15 leading-none hover:bg-kraft/15 dark:border-paper/15 dark:hover:bg-paper/10"
              aria-label="缩小"
            >
              −
            </button>
          </div>
          <button
            type="button"
            onClick={recenter}
            className="pointer-events-auto rounded-full border border-kraft-dark/30 bg-paper/90 px-3 py-1 text-xs text-ink shadow-sm hover:bg-paper dark:border-paper/20 dark:bg-ink-deep/80 dark:text-paper"
          >
            🎯 回中心
          </button>
        </div>
      </div>
    </div>
  );
}
