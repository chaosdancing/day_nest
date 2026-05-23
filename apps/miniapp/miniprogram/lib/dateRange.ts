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
    // Use local-year (matches apps/web/src/lib/timelineFilters.ts) so a user
    // opening the app at 02:00 on Jan 1 in UTC+8 sees the new year preset,
    // not the previous one. Trailing-day presets below use UTC math (also
    // matching web) — the slight internal inconsistency is intentional.
    const year = now.getFullYear();
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  const days = preset === '7d' ? 6 : 29;
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  return { dateFrom: formatDateInput(from), dateTo: formatDateInput(now) };
}
