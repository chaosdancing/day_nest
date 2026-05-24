import { describe, it, expect } from 'vitest';
import { qs, ensureOk } from '../../../miniprogram/lib/services/_http.js';

describe('services/_http', () => {
  describe('qs()', () => {
    it('returns empty string when no params survive', () => {
      expect(qs({})).toBe('');
      expect(qs({ a: undefined, b: null, c: '' })).toBe('');
    });

    it('skips undefined / null / empty values', () => {
      expect(qs({ a: 'x', b: undefined, c: null, d: '', e: 0 })).toBe(
        '?a=x&e=0',
      );
    });

    it('encodes UTF-8 keys and values', () => {
      expect(qs({ title: '春' })).toBe('?title=%E6%98%A5');
    });

    it('encodes numbers as strings', () => {
      expect(qs({ limit: 30, page: 2 })).toBe('?limit=30&page=2');
    });
  });

  describe('ensureOk()', () => {
    it('returns void for 200', () => {
      expect(() => ensureOk('GET', 'http://x/api', 200, {})).not.toThrow();
    });

    it('returns void for any 2xx status', () => {
      expect(() => ensureOk('POST', 'http://x/api', 201, {})).not.toThrow();
      expect(() => ensureOk('DELETE', 'http://x/api', 204, {})).not.toThrow();
    });

    it('throws on 4xx with body error code', () => {
      expect(() =>
        ensureOk('POST', 'http://x/api/p/1/favorite', 404, {
          error: { code: 'NOT_FOUND' },
        }),
      ).toThrow(/POST http:\/\/x\/api\/p\/1\/favorite -> 404 NOT_FOUND/);
    });

    it('throws on 5xx with HTTP_<status> fallback when body has no error code', () => {
      expect(() =>
        ensureOk('GET', 'http://x/api/collections', 500, null),
      ).toThrow(/GET http:\/\/x\/api\/collections -> 500 HTTP_500/);
    });

    it('strips query string from error messages (PII safety)', () => {
      try {
        ensureOk(
          'GET',
          'http://x/api/collections?title=secret&location=home',
          500,
          { error: { code: 'SERVER' } },
        );
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as Error).message).not.toContain('title=secret');
        expect((e as Error).message).not.toContain('location=home');
        expect((e as Error).message).toContain('http://x/api/collections');
        expect((e as Error).message).toContain('SERVER');
      }
    });
  });
});
