import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../miniprogram/lib/debounce.js';

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not invoke fn before delay elapses', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes fn once after delay with latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    d.run('b');
    d.run('c');
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cancel() prevents the pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() invokes immediately with latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.run('a');
    d.run('b');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() with no pending call is a no-op', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });
});
