import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseExif } from '../../miniprogram/lib/exif.js';

function loadFixture(name: string): ArrayBuffer {
  const b64 = readFileSync(
    resolve(__dirname, '../fixtures/' + name + '.base64'),
    'utf8',
  ).trim();
  const bytes = Buffer.from(b64, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('parseExif', () => {
  it('returns null fields for non-JPEG input', () => {
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(parseExif(buf).dateTimeOriginal).toBeNull();
  });

  it('returns null fields for a JPEG with no EXIF', () => {
    const buf = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]).buffer;
    expect(parseExif(buf).dateTimeOriginal).toBeNull();
  });

  it('reads DateTimeOriginal from a JPEG with a populated EXIF block', () => {
    const buf = loadFixture('exif-2024-01-15.jpg');
    const info = parseExif(buf);
    expect(info.dateTimeOriginal).toBe('2024-01-15T10:30:00');
  });

  it('does not throw on truncated input', () => {
    const buf = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10]).buffer;
    expect(() => parseExif(buf)).not.toThrow();
    expect(parseExif(buf).dateTimeOriginal).toBeNull();
  });
});
