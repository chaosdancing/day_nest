import { stableInt, stableAngle } from '../../lib/hash.js';

interface PhotoLike {
  id: string;
  thumbnailUrl: string;
}

Component({
  options: { multipleSlots: false },
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
    slots: [] as Array<{
      // Unique per-slot key so wx:key avoids dup-key warnings when a
      // collection has fewer than 3 preview photos.
      key: string;
      thumb: string;
      angle: number;
      tape: number;
      offsetX: number;
      offsetY: number;
    }>,
  },
  observers: {
    previewPhotos(list: PhotoLike[]) {
      const items = (list ?? []).slice(0, 3);
      const slots: typeof this.data.slots = [];
      // back-most first, top-most last — push only present photos so that the
      // WXML never renders empty slots and wx:key stays unique.
      for (let i = 2; i >= 0; i--) {
        const p = items[i];
        if (!p) continue;
        const angle = i === 0 ? stableAngle(p.id, 1) : stableAngle(p.id, 6);
        const offsetX = i === 0 ? 0 : (i === 1 ? 14 : 28);
        const offsetY = i === 0 ? 0 : (i === 1 ? 10 : 20);
        slots.push({
          key: p.id,
          thumb: p.thumbnailUrl,
          angle,
          tape: stableInt(p.id, 4),
          offsetX,
          offsetY,
        });
      }
      this.setData({ slots });
    },
  },
});
