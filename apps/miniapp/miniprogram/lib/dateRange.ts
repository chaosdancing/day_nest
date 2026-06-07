/**
 * Date-range presets for the timeline filter bar. The mini-app ships four
 * chips — 全部 / 今年 / 当月 / 自定义 (all / year / month / custom). The
 * "当月" preset replaces the web's trailing-90-day "近 90 天" so phone users
 * get a tidy "this calendar month" jump that matches how they think about
 * recent uploads.
 */
export type DatePreset = 'all' | 'year' | 'month' | 'custom';

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
    // Local-year so a user opening the app at 02:00 on Jan 1 in UTC+8 sees
    // the new year preset, not the previous one.
    const year = now.getFullYear();
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  // 'month' → the current local calendar month, first day .. last day.
  // Built from local getFullYear()/getMonth() (same reasoning as 'year')
  // and `new Date(year, month + 1, 0)` for the month's last day.
  const year = now.getFullYear();
  const month = now.getMonth();
  const mm = String(month + 1).padStart(2, '0');
  const lastDay = String(new Date(year, month + 1, 0).getDate()).padStart(2, '0');
  return { dateFrom: `${year}-${mm}-01`, dateTo: `${year}-${mm}-${lastDay}` };
}
