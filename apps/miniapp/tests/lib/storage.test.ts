import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { storage } from '../../miniprogram/lib/storage.js';

describe('storage wrapper', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('get returns null when the key is missing', () => {
    expect(storage.get<string>('missing')).toBeNull();
  });

  it('set writes through and get reads back the same value', () => {
    storage.set('user', { id: 'u1', name: 'A' });
    expect(storage.get('user')).toEqual({ id: 'u1', name: 'A' });
  });

  it('remove deletes the key', () => {
    storage.set('x', 1);
    storage.remove('x');
    expect(storage.get('x')).toBeNull();
    expect(mock.storage.has('x')).toBe(false);
  });

  it('preserves type information across set/get for objects', () => {
    type T = { a: number; b: string };
    storage.set<T>('obj', { a: 1, b: 'two' });
    const out = storage.get<T>('obj');
    expect(out?.a).toBe(1);
    expect(out?.b).toBe('two');
  });

  it('treats the empty-string wx default as null', () => {
    mock.storage.set('weird', '');
    expect(storage.get('weird')).toBeNull();
  });
});
