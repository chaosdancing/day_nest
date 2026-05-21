import { type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { deterministicTilt } from '@/lib/deterministicTilt';
import { Polaroid } from './Polaroid';

type StackedPolaroidProps = {
  /**
   * Photos to render as a stack, top-of-pile last. Typically the first
   * entry is the cover and the rest are subsequent photos from the same
   * collection. 1-3 entries; if fewer than 3 are given the stack just
   * has 1-2 layers (no padding with fakes — honest about how many photos
   * are in the collection).
   */
  photos: Array<{ id: string; thumbnailUrl: string }>;
  alt?: string;
  caption?: string | null;
  /** Seed for deterministic tilt/offset of the top card. */
  tiltSeed: string;
  /** Override the top card's tilt (deg). */
  tilt?: number;
  aspectRatio?: number;
  className?: string;
  style?: CSSProperties;
  /**
   * Optional framer-motion layoutId forwarded to the TOP polaroid. The
   * back layers stay aria-hidden, so they shouldn't take part in
   * shared-layout animations. Used by the timeline → photo viewer
   * morph transition.
   */
  topLayoutId?: string;
};

/**
 * A "pile of polaroids" preview. Renders up to two slightly rotated back
 * layers (real photos from the collection) behind a top polaroid so the
 * whole tile reads as "an album", not a single picture. Layers are
 * deterministically offset+rotated by the photo id so the same collection
 * always pins down to the same arrangement on the corkboard.
 *
 * Visual behavior:
 *   - 1 photo  → single polaroid, no stack
 *   - 2 photos → one back layer peeking ~6° one way
 *   - 3 photos → two back layers, fanned to opposite sides
 *
 * The back layers are aria-hidden and pointer-events-none so screen
 * readers and click handlers only see the top card.
 */
export function StackedPolaroid({
  photos,
  alt = '',
  caption,
  tiltSeed,
  tilt,
  aspectRatio,
  className,
  style,
  topLayoutId,
}: StackedPolaroidProps) {
  if (photos.length === 0) return null;

  // Top card is the last in the photos array so back layers naturally
  // sit underneath in DOM order.
  const top = photos[0]!;
  const back = photos.slice(1, 3);

  // Deterministic per-collection offsets keep things stable across
  // renders/page reloads.
  const backLayers = back.map((p, i) => {
    const sign = i === 0 ? -1 : 1;
    const angle = deterministicTilt(`${tiltSeed}-back-${p.id}`, 4) + sign * 7;
    // Small px offsets — keep the back cards mostly hidden behind the top
    // one, with just an edge peeking out.
    const dx = sign * (10 + i * 4);
    const dy = 6 + i * 4;
    return {
      photo: p,
      transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg)`,
      zIndex: -1 - i,
    };
  });

  return (
    <div
      className={cn('relative', className)}
      style={style}
      data-stack-size={photos.length}
    >
      {/* Back layers — real photos from the collection, slightly rotated
          and pushed outward. */}
      {backLayers.map((layer) => (
        <motion.div
          key={layer.photo.id}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ transform: layer.transform, zIndex: layer.zIndex }}
        >
          <div className="polaroid select-none">
            <div
              className="overflow-hidden bg-paper-dark/40"
              style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
            >
              <img
                src={layer.photo.thumbnailUrl}
                alt=""
                loading="lazy"
                className="block w-full h-full object-cover"
                draggable={false}
              />
            </div>
          </div>
        </motion.div>
      ))}

      {/* Top card — the only interactive one. */}
      <div className="relative" style={{ zIndex: 1 }}>
        <Polaroid
          src={top.thumbnailUrl}
          alt={alt}
          caption={caption}
          tiltSeed={tiltSeed}
          tilt={tilt}
          aspectRatio={aspectRatio}
          layoutId={topLayoutId}
        />
      </div>
    </div>
  );
}
