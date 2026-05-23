export type DatePreset = 'all' | '7d' | '30d' | 'year' | 'custom';

export interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

export function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildPresetRange(
  preset: Exclude<DatePreset, 'custom'>,
  now: Date = new Date(),
): DateRange {
  if (preset === 'all') return {};
  if (preset === 'year') {
    const year = now.getUTCFullYear();
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  const days = preset === '7d' ? 6 : 29;
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  return { dateFrom: formatDateInput(from), dateTo: formatDateInput(now) };
}
