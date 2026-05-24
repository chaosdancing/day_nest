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

  it('preset "quarter" spans the trailing 90 days inclusive', () => {
    const ref = new Date('2026-05-31T00:00:00Z');
    const range = buildPresetRange('quarter', ref);
    expect(range.dateTo).toBe('2026-05-31');
    // 89 days back from 2026-05-31 → 2026-03-03 (inclusive 90-day window).
    expect(range.dateFrom).toBe('2026-03-03');
  });

  it('exports DatePreset type accepting the documented values', () => {
    const allowed: DatePreset[] = ['all', 'year', 'quarter', 'custom'];
    expect(allowed.length).toBe(4);
  });
});
