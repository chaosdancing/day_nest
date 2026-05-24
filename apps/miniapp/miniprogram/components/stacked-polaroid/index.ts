import { stableInt, stableAngle } from '../../lib/hash.js';

interface PhotoLike {
  id: string;
  thumbnailUrl: string;
}

interface BackLayer {
  /** Stable WX key. */
  key: string;
  thumb: string;
  /** Computed `transform:` string applied via inline style. */
  transform: string;
}

/**
 * StackedPolaroid (timeline collection card).
 *
 * Mirrors apps/web/src/components/scrapbook/StackedPolaroid.tsx — up to two
 * REAL back photos peek out behind the front cover, deterministically
 * offset and rotated so the same collection always lands in the same
 * arrangement.
 *
 *   1 photo  → single polaroid (no stack)
 *   2 photos → one back layer pushed left
 *   3+ photos → two back layers, fanned left + right
 *
 * Front cover is rendered in the normal flow so it defines the bounding
 * box; back layers are `position: absolute; inset: 0`, scaled into the
 * same footprint but translated outward to peek.
 *
 * `apply-shared` styleIsolation is required so the shared `.polaroid` /
 * `.polaroid__photo-frame` rules in styles/polaroid.wxss actually apply
 * to <view class="polaroid"> inside this component.
 */
Component({
  options: { multipleSlots: false, styleIsolation: 'apply-shared' },
  properties: {
    previewPhotos: {
      type: Array,
      value: [] as PhotoLike[],
    },
    photoCount: {
      type: Number,
      value: 0,
    },
    caption: {
      type: String,
      value: '',
    },
  },
  data: {
    frontThumb: '',
    frontAngle: 0,
    tape: -1,
    backLayers: [] as BackLayer[],
  },
  observers: {
    previewPhotos(list: PhotoLike[]) {
      const items = (list ?? []).filter((p) => p && p.thumbnailUrl);
      const front = items[0];
      if (!front) {
        this.setData({ frontThumb: '', frontAngle: 0, tape: -1, backLayers: [] });
        return;
      }
      const back = items.slice(1, 3);
      const backLayers: BackLayer[] = back.map((p, i) => {
        // Sign alternates: first back layer goes left (-), second goes right (+).
        // Matches web's `sign = i === 0 ? -1 : 1`.
        const sign = i === 0 ? -1 : 1;
        // Tilt ±9..±11° away from the front. Smaller than before so the
        // rotated corners don't blow past the timeline row's right edge.
        const baseAngle = stableAngle(`${p.id}-back`, 3);
        const angle = baseAngle + sign * 6;
        // 14rpx + 6rpx per layer outward; 10rpx + 6rpx down. Tightened from
        // 20/14 so the stack stays compact under the new max-width:530rpx
        // timeline cards while still showing a clear "pile" silhouette.
        const dx = sign * (14 + i * 6);
        const dy = 10 + i * 6;
        return {
          key: p.id,
          thumb: p.thumbnailUrl,
          transform: `translate(${dx}rpx, ${dy}rpx) rotate(${angle}deg)`,
        };
      });
      this.setData({
        frontThumb: front.thumbnailUrl,
        frontAngle: stableAngle(front.id, 2),
        tape: stableInt(front.id, 4),
        backLayers,
      });
    },
  },
});
