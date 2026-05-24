import { stableAngle, stableInt } from '../../lib/hash.js';

Component({
  // See stacked-polaroid for why we need apply-shared — the polaroid frame
  // styles live in styles/polaroid.wxss and must penetrate the component.
  options: { styleIsolation: 'apply-shared' },
  properties: {
    photoId: { type: String, value: '' },
    thumbnailUrl: { type: String, value: '' },
    caption: { type: String, value: '' },
    /** Optional small mono-date / location subtitle rendered under the
     *  handwritten caption. Used by Favorites to show occurredOn. */
    subtitle: { type: String, value: '' },
    /** Optional precomputed inline style for the photo frame, e.g.
     *  "padding-top: 133.33%". Keep this precomputed by the parent instead
     *  of deriving it with a component observer: changing heights from many
     *  child setData calls inside scroll-view + CSS columns can lock up the
     *  WeChat simulator's layout engine. */
    frameStyle: { type: String, value: '' },
    /** Optional explicit tilt angle. Favorites uses this to alternate the
     *  first row left/right so the scrapbook pile feels less mechanical. */
    tiltDeg: { type: Number, value: 0 },
    favoritedByMe: { type: Boolean, value: false },
    favoriteCount: { type: Number, value: 0 },
    showHeart: { type: Boolean, value: true },
  },
  data: {
    angle: 0,
    tape: 0,
  },
  observers: {
    'photoId,tiltDeg'(id: string, tiltDeg: number) {
      if (!id) return;
      // Range matches web's apps/web/src/lib/deterministicTilt.ts default
      // call site (Polaroid → deterministicTilt(tiltSeed, 4)).
      this.setData({
        angle: typeof tiltDeg === 'number' && tiltDeg !== 0 ? tiltDeg : stableAngle(id, 4),
        tape: stableInt(id, 4),
      });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('phototap', { photoId: this.data.photoId });
    },
    onFavoriteTap(e: WechatMiniprogram.TouchEvent) {
      // catchtap in WXML already stops propagation at the WX layer; this is a
      // defensive guard for runtimes that surface a DOM-style stopPropagation.
      (e as { stopPropagation?: () => void }).stopPropagation?.();
      this.triggerEvent('favoritetap', { photoId: this.data.photoId });
    },
  },
});
