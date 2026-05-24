import {
  buildPresetRange,
  type DatePreset,
  type DateRange,
} from '../../lib/dateRange.js';

/**
 * Filter bar for the timeline. Mirrors apps/web/src/pages/TimelinePage.tsx
 * preset row: emoji chips with inline × clear on the active non-default
 * chip, a 📍 location input that tints when filled, and a custom date-range
 * row (two pickers) revealed only when the "自定义" preset is selected.
 *
 * Emits a single `change` event whose detail is a {DateRange, location}
 * object. Parent debounces by re-issuing the API call.
 */
const PRESETS: Array<{ key: DatePreset; label: string; emoji: string }> = [
  { key: 'all', label: '全部', emoji: '🌐' },
  { key: 'year', label: '今年', emoji: '🌞' },
  { key: 'quarter', label: '近 90 天', emoji: '⏳' },
  { key: 'custom', label: '自定义', emoji: '✏️' },
];

Component({
  data: {
    presets: PRESETS,
    active: 'all' as DatePreset,
    customFrom: '',
    customTo: '',
    location: '',
  },
  methods: {
    onPresetTap(e: WechatMiniprogram.TouchEvent) {
      const key = e.currentTarget.dataset.key as DatePreset;
      if (key === 'custom') {
        this.setData({ active: 'custom' });
        this.emitCustom();
        return;
      }
      const range = buildPresetRange(key);
      this.setData({ active: key, customFrom: '', customTo: '' });
      this.emit(range);
    },
    /**
     * Active-chip inline clear (×). Bound to all chips except 'all'; we
     * stop propagation so the tap doesn't also re-trigger onPresetTap.
     */
    onClearActive(e: WechatMiniprogram.TouchEvent) {
      // stopPropagation isn't typed on older WechatMiniprogram.TouchEvent.
      (e as { stopPropagation?: () => void }).stopPropagation?.();
      this.setData({ active: 'all', customFrom: '', customTo: '' });
      this.emit({});
    },
    onCustomFrom(e: WechatMiniprogram.PickerChange) {
      const v = String(e.detail.value);
      this.setData({ customFrom: v });
      this.emitCustom();
    },
    onCustomTo(e: WechatMiniprogram.PickerChange) {
      const v = String(e.detail.value);
      this.setData({ customTo: v });
      this.emitCustom();
    },
    onLocation(e: WechatMiniprogram.Input) {
      this.setData({ location: e.detail.value });
      this.emitWithCurrentRange();
    },
    onLocationClear() {
      this.setData({ location: '' });
      this.emitWithCurrentRange();
    },
    emitCustom() {
      this.emit({
        dateFrom: this.data.customFrom || undefined,
        dateTo: this.data.customTo || undefined,
      });
    },
    /**
     * Re-emit using whatever active range mode is currently selected.
     * Used by the location input so changing the location doesn't reset
     * the date range to "all".
     */
    emitWithCurrentRange() {
      if (this.data.active === 'custom') {
        this.emitCustom();
      } else if (this.data.active === 'all') {
        this.emit({});
      } else {
        this.emit(buildPresetRange(this.data.active));
      }
    },
    emit(range: DateRange) {
      this.triggerEvent('change', {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        location: this.data.location || undefined,
      });
    },
  },
});
