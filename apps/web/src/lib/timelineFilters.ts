export type DatePreset = 'all' | 'year' | 'quarter' | 'custom';

export type DateRange = {
  dateFrom?: string;
  dateTo?: string;
};

export function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildDatePresetRange(
  preset: Exclude<DatePreset, 'custom'>,
  now = new Date()
): DateRange {
  if (preset === 'all') return {};
  if (preset === 'year') {
    const year = now.getFullYear();
    return {
      dateFrom: `${year}-01-01`,
      dateTo: `${year}-12-31`,
    };
  }

  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 89);
  return {
    dateFrom: formatDateInput(from),
    dateTo: formatDateInput(now),
  };
}
