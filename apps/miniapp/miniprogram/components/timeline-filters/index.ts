import { buildPresetRange, type DatePreset, type DateRange } from '../../lib/dateRange.js';

const PRESETS: Array<{ key: DatePreset; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'year', label: '今年' },
  { key: 'custom', label: '自定义' },
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
        return;
      }
      const range = buildPresetRange(key);
      this.setData({ active: key, customFrom: '', customTo: '' });
      this.emit(range);
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
      this.emit({ dateFrom: this.data.customFrom || undefined, dateTo: this.data.customTo || undefined });
    },
    emitCustom() {
      this.emit({
        dateFrom: this.data.customFrom || undefined,
        dateTo: this.data.customTo || undefined,
      });
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
