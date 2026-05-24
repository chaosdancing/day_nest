/**
 * Date-range presets, kept 1:1 with apps/web/src/lib/timelineFilters.ts
 * so both surfaces show the same chips. Web ships only four presets
 * (all / year / quarter / custom); we follow.
 */
export type DatePreset = 'all' | 'year' | 'quarter' | 'custom';

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
    // Local-year (matches web) so a user opening the app at 02:00 on Jan 1
    // in UTC+8 sees the new year preset, not the previous one.
    const year = now.getFullYear();
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  // 'quarter' → trailing 90 days. UTC math (matches web). The "near 90 days"
  // window includes today, so we step back 89 days from `now`.
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 89);
  return { dateFrom: formatDateInput(from), dateTo: formatDateInput(now) };
}
