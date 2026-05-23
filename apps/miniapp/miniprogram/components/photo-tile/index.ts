import { stableAngle, stableInt } from '../../lib/hash.js';

Component({
  properties: {
    photoId: { type: String, value: '' },
    thumbnailUrl: { type: String, value: '' },
    caption: { type: String, value: '' },
    favoritedByMe: { type: Boolean, value: false },
    favoriteCount: { type: Number, value: 0 },
    showHeart: { type: Boolean, value: true },
  },
  data: {
    angle: 0,
    tape: 0,
  },
  observers: {
    photoId(id: string) {
      if (!id) return;
      this.setData({
        angle: stableAngle(id, 3),
        tape: stableInt(id, 4),
      });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { photoId: this.data.photoId });
    },
    onFavoriteTap(e: WechatMiniprogram.TouchEvent) {
      // catchtap in WXML already stops propagation at the WX layer; this is a
      // defensive guard for runtimes that surface a DOM-style stopPropagation.
      (e as { stopPropagation?: () => void }).stopPropagation?.();
      this.triggerEvent('favoritetap', { photoId: this.data.photoId });
    },
  },
});
