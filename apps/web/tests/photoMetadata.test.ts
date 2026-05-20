import assert from 'node:assert/strict';
import {
  formatDateInputValue,
  pickExifTakenAt,
} from '../src/lib/photoMetadata.ts';

const original = new Date('2020-02-03T04:05:06.000Z');
assert.equal(pickExifTakenAt({ DateTimeOriginal: original }), original.toISOString());

const createDate = new Date('2021-03-04T05:06:07.000Z');
assert.equal(pickExifTakenAt({ CreateDate: createDate }), createDate.toISOString());

assert.equal(
  pickExifTakenAt({
    DateTimeOriginal: null,
    CreateDate: undefined,
    ModifyDate: '2022-04-05T06:07:08.000Z',
  }),
  '2022-04-05T06:07:08.000Z'
);

assert.equal(formatDateInputValue('2023-09-10T23:59:58.000Z'), '2023-09-10');
assert.equal(formatDateInputValue(null), null);

console.log('photo metadata tests passed');
