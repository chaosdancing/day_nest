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
      thumb: string;
      angle: number;
      tape: number;
      offsetX: number;
      offsetY: number;
      visible: boolean;
    }>,
  },
  observers: {
    previewPhotos(list: PhotoLike[]) {
      const items = (list ?? []).slice(0, 3);
      const slots: typeof this.data.slots = [];
      // back-most first, top-most last
      for (let i = 2; i >= 0; i--) {
        const p = items[i];
        if (!p) {
          slots.push({ thumb: '', angle: 0, tape: 0, offsetX: 0, offsetY: 0, visible: false });
          continue;
        }
        const angle = i === 0 ? stableAngle(p.id, 1) : stableAngle(p.id, 6);
        const offsetX = i === 0 ? 0 : (i === 1 ? 14 : 28);
        const offsetY = i === 0 ? 0 : (i === 1 ? 10 : 20);
        slots.push({
          thumb: p.thumbnailUrl,
          angle,
          tape: stableInt(p.id, 4),
          offsetX,
          offsetY,
          visible: true,
        });
      }
      this.setData({ slots });
    },
  },
});
