import { describe, it, expect } from 'vitest';
import { buildPresetRange, formatDateInput, type DatePreset } from '../../miniprogram/lib/dateRange.js';

describe('dateRange', () => {
  it('formatDateInput returns YYYY-MM-DD', () => {
    expect(formatDateInput(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05');
  });

  it('preset "all" returns empty range', () => {
    expect(buildPresetRange('all')).toEqual({});
  });

  it('preset "year" spans the calendar year of the reference date', () => {
    const ref = new Date('2026-08-15T00:00:00Z');
    expect(buildPresetRange('year', ref)).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
  });

  it('preset "30d" spans the trailing 30 days inclusive', () => {
    const ref = new Date('2026-05-31T00:00:00Z');
    const range = buildPresetRange('30d', ref);
    expect(range.dateTo).toBe('2026-05-31');
    expect(range.dateFrom).toBe('2026-05-02');
  });

  it('preset "7d" spans the trailing 7 days inclusive', () => {
    const ref = new Date('2026-05-31T00:00:00Z');
    const range = buildPresetRange('7d', ref);
    expect(range.dateTo).toBe('2026-05-31');
    expect(range.dateFrom).toBe('2026-05-25');
  });

  it('exports DatePreset type accepting the documented values', () => {
    const allowed: DatePreset[] = ['all', '7d', '30d', 'year', 'custom'];
    expect(allowed.length).toBe(5);
  });
});
