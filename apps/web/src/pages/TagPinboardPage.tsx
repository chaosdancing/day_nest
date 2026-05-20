import { useMemo, useRef, useState, type CSSProperties, type WheelEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCollections } from '@/hooks/useCollections';
import { Polaroid } from '@/components/scrapbook/Polaroid';
import { Pin } from '@/components/scrapbook/Pin';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { deterministicTilt } from '@/lib/deterministicTilt';

const BOARD_WIDTH = 1800;
const BOARD_HEIGHT = 1400;
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

function position(seed: string, idx: number): { x: number; y: number } {
  const h1 = hash(`${seed}-x-${idx}`);
  const h2 = hash(`${seed}-y-${idx}`);
  const padX = 160;
  const padY = 120;
  return {
    x: padX + ((h1 % 1000) / 1000) * (BOARD_WIDTH - padX * 2),
    y: padY + ((h2 % 1000) / 1000) * (BOARD_HEIGHT - padY * 2),
  };
}

export function TagPinboardPage() {
  const { name } = useParams();
  const tagName = decodeURIComponent(name ?? '');
  const q = useCollections({ tag: tagName, limit: 50 });
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const placed = useMemo(
    () =>
      items.map((c, idx) => ({
        c,
        pos: position(tagName, idx),
        pinColor: PIN_COLORS[hash(c.id) % PIN_COLORS.length]!,
      })),
    [items, tagName]
  );

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setScale((s) => Math.max(0.5, Math.min(2, s + (e.deltaY < 0 ? 0.08 : -0.08))));
  };

  return (
    <div className="pb-12 -mx-4 sm:-mx-6">
      <div className="text-center py-6">
        <Link to="/tags" className="text-sm text-ink/60 hover:text-ink">
          ← 全部标签
        </Link>
        <HandwrittenText as="h1" className="text-5xl block mt-2">
          # {tagName}
        </HandwrittenText>
        <p className="font-mono text-xs text-ink/50 mt-1">
          {items.length} ENTRIES · 拖动平移 / ⌘+滚轮缩放
        </p>
      </div>

      <div
        ref={containerRef}
        onWheel={onWheel}
        className="relative overflow-hidden bg-cork-board border-y border-kraft-dark/20"
        style={{ height: '70vh' }}
      >
        <motion.div
          drag
          dragConstraints={{
            left: -(BOARD_WIDTH * scale) + (containerRef.current?.clientWidth ?? 800),
            right: 0,
            top: -(BOARD_HEIGHT * scale) + (containerRef.current?.clientHeight ?? 600),
            bottom: 0,
          }}
          dragElastic={0.05}
          style={
            {
              width: BOARD_WIDTH,
              height: BOARD_HEIGHT,
              scale,
              transformOrigin: '0 0',
            } as CSSProperties
          }
          className="absolute touch-pan-x touch-pan-y"
        >
          {placed.map(({ c, pos, pinColor }) => (
            <Link
              key={c.id}
              to={`/c/${c.id}`}
              className="absolute"
              style={{ left: pos.x, top: pos.y, width: 200 }}
            >
              <div className="relative">
                <Pin
                  color={pinColor}
                  className="absolute left-1/2 -translate-x-1/2 -top-1.5 z-10"
                />
                <Polaroid
                  src={c.coverPhoto?.thumbnailUrl ?? ''}
                  alt={c.title}
                  tiltSeed={`${tagName}-${c.id}`}
                  tilt={deterministicTilt(`${tagName}-${c.id}`, 6)}
                  caption={c.title}
                  aspectRatio={4 / 3}
                />
              </div>
            </Link>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
