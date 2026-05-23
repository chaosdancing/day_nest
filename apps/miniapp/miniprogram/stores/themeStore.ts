import type { ThemeMode } from '@daynest/shared';
import { createStore } from '../lib/store.js';
import { storage } from '../lib/storage.js';

export const THEME_STORAGE_KEY = 'daynest.theme.mode';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
}

const store = createStore<ThemeState>({ mode: 'system', resolved: 'light' });

function readSystem(): 'light' | 'dark' {
  try {
    const sys = wx.getSystemInfoSync();
    return sys.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return readSystem();
}

export const themeStore = {
  getState: store.getState,
  subscribe: store.subscribe,

  hydrate(): void {
    const persisted = storage.get<ThemeMode>(THEME_STORAGE_KEY) ?? 'system';
    store.setState({ mode: persisted, resolved: resolve(persisted) });
  },

  setMode(mode: ThemeMode): void {
    storage.set(THEME_STORAGE_KEY, mode);
    store.setState({ mode, resolved: resolve(mode) });
  },

  /** Re-resolve when the system theme changes (only meaningful when mode==='system'). */
  refresh(): void {
    store.setState({ resolved: resolve(store.getState().mode) });
  },

  /** Test-only reset; does NOT touch storage. */
  reset(): void {
    store.setState({ mode: 'system', resolved: 'light' });
  },
};
