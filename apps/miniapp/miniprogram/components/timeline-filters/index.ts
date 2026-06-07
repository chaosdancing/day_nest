import {
  buildPresetRange,
  formatDateInput,
  type DatePreset,
  type DateRange,
} from '../../lib/dateRange.js';

/** Default custom-range span when the user first opens 自定义: trailing 90 days. */
const CUSTOM_DEFAULT_SPAN_DAYS = 89;

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
  { key: 'month', label: '当月', emoji: '🗓️' },
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
        // First time into 自定义 with no range chosen yet: seed the pickers
        // with a sensible trailing-90-day window so the user sees (and the
        // parent receives) a concrete range instead of an empty one.
        let { customFrom, customTo } = this.data;
        if (!customFrom && !customTo) {
          const today = new Date();
          const from = new Date(today);
          from.setDate(from.getDate() - CUSTOM_DEFAULT_SPAN_DAYS);
          customFrom = formatDateInput(from);
          customTo = formatDateInput(today);
        }
        this.setData({ active: 'custom', customFrom, customTo });
        this.emit({ dateFrom: customFrom || undefined, dateTo: customTo || undefined });
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
