import { stableInt, stableAngle } from '../../lib/hash.js';

/**
 * <tape-chip label="周末" count="3" tone="auto" active="{{false}}" />
 *
 * Approximates apps/web/src/components/scrapbook/TapeBadge.tsx — a flat
 * pill rendered with handwriting font + slight rotation. `tone` can be:
 *
 *   'auto'   (default) — hashes the label to one of 4 tape colors
 *   '0'|'1'|'2'|'3'    — explicit tone bucket
 *
 * Rotation magnitude is also derived from the label hash so rows of chips
 * look hand-stuck rather than uniform.
 */
Component({
  properties: {
    label: { type: String, value: '' },
    count: { type: String, value: '' },
    /** 'auto' | '0' | '1' | '2' | '3' */
    tone: { type: String, value: 'auto' },
    active: { type: Boolean, value: false },
    /** Stable seed for tilt; defaults to label. Override if you want a
        stable look across components rendering the same label. */
    tiltSeed: { type: String, value: '' },
  },
  data: {
    tiltDeg: 0,
    /** Resolved tone bucket (0..3). Kept distinct from the `tone` prop so
        we never write back to a property and risk an observer loop. */
    resolvedTone: '0',
  },
  observers: {
    'tiltSeed,label,tone'(this: WechatMiniprogram.Component.TrivialInstance) {
      const props = this.properties as {
        label: string;
        tone: string;
        tiltSeed: string;
      };
      const seed = props.tiltSeed || props.label || '';
      const tiltDeg = stableAngle(seed, 3);
      const resolvedTone =
        props.tone === 'auto' ? String(stableInt(seed, 4)) : props.tone;
      this.setData({ tiltDeg, resolvedTone });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    },
  },
});
