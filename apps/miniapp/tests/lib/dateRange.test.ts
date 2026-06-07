import { describe, it, expect } from 'vitest';
import { buildPresetRange, formatDateInput, type DatePreset } from '../../miniprogram/lib/dateRange.js';

describe('dateRange', () => {
  it('formatDateInput returns YYYY-MM-DD', () => {
    expect(formatDateInput(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05');
  });

  it('preset "all" returns empty range', () => {
    expect(buildPresetRange('all')).toEqual({});
  });

  it('preset "year" spans the local calendar year of the reference date', () => {
    // Reference date chosen to be mid-year so local and UTC agree regardless
    // of the test machine's timezone. The year-boundary case (where local and
    // UTC can diverge) is the very reason we use getFullYear() — see comment
    // in dateRange.ts.
    const ref = new Date('2026-08-15T12:00:00Z');
    const range = buildPresetRange('year', ref);
    expect(range.dateFrom).toBe('2026-01-01');
    expect(range.dateTo).toBe('2026-12-31');
  });

  it('preset "month" spans the local calendar month of the reference date', () => {
    // Mid-month noon-UTC reference so local and UTC agree on the month
    // regardless of the test machine's timezone (same reasoning as "year").
    const ref = new Date('2026-08-15T12:00:00Z');
    const range = buildPresetRange('month', ref);
    expect(range.dateFrom).toBe('2026-08-01');
    expect(range.dateTo).toBe('2026-08-31');
  });

  it('preset "month" handles a 30-day month', () => {
    const ref = new Date('2026-04-10T12:00:00Z');
    const range = buildPresetRange('month', ref);
    expect(range.dateFrom).toBe('2026-04-01');
    expect(range.dateTo).toBe('2026-04-30');
  });

  it('exports DatePreset type accepting the documented values', () => {
    const allowed: DatePreset[] = ['all', 'year', 'month', 'custom'];
    expect(allowed.length).toBe(4);
  });
});
