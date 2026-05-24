import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../miniprogram/lib/store.js';

describe('createStore', () => {
  it('exposes initial state via getState()', () => {
    const store = createStore({ count: 0 });
    expect(store.getState()).toEqual({ count: 0 });
  });

  it('setState applies a partial update and notifies subscribers', () => {
    const store = createStore({ count: 0, name: 'a' });
    const sub = vi.fn();
    store.subscribe(sub);
    store.setState({ count: 1 });
    expect(store.getState()).toEqual({ count: 1, name: 'a' });
    expect(sub).toHaveBeenCalledTimes(1);
    expect(sub).toHaveBeenCalledWith({ count: 1, name: 'a' });
  });

  it('does NOT notify subscribers when nothing actually changes', () => {
    const store = createStore({ count: 0 });
    const sub = vi.fn();
    store.subscribe(sub);
    store.setState({ count: 0 });
    expect(sub).not.toHaveBeenCalled();
  });

  it('subscribe returns an unsubscribe function that stops notifications', () => {
    const store = createStore({ count: 0 });
    const sub = vi.fn();
    const unsub = store.subscribe(sub);
    store.setState({ count: 1 });
    unsub();
    store.setState({ count: 2 });
    expect(sub).toHaveBeenCalledTimes(1);
  });

  it('a subscriber thrown error does not break other subscribers', () => {
    const store = createStore({ count: 0 });
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    store.subscribe(bad);
    store.subscribe(good);
    expect(() => store.setState({ count: 1 })).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
  });

  it('setState accepts an updater function', () => {
    const store = createStore({ count: 5 });
    store.setState((s) => ({ count: s.count + 1 }));
    expect(store.getState().count).toBe(6);
  });
});
