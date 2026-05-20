import assert from 'node:assert/strict';
import {
  buildDatePresetRange,
  formatDateInput,
} from '../src/lib/timelineFilters.ts';

const now = new Date('2026-05-21T12:00:00.000Z');

assert.deepEqual(buildDatePresetRange('all', now), {});
assert.deepEqual(buildDatePresetRange('year', now), {
  dateFrom: '2026-01-01',
  dateTo: '2026-12-31',
});
assert.deepEqual(buildDatePresetRange('quarter', now), {
  dateFrom: '2026-02-21',
  dateTo: '2026-05-21',
});
assert.equal(formatDateInput(new Date('2026-05-03T08:00:00.000Z')), '2026-05-03');

console.log('timeline filter tests passed');
