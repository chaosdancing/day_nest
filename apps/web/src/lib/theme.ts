import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = mode;
}

function detectInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = localStorage.getItem('daynest-theme');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { mode?: ThemeMode } };
      if (parsed.state?.mode) return parsed.state.mode;
    }
  } catch {
    // ignore
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

const initial = detectInitialMode();
applyTheme(initial);

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: initial,
      setMode: (mode) => {
        applyTheme(mode);
        set({ mode });
      },
      toggle: () =>
        set((s) => {
          const next: ThemeMode = s.mode === 'dark' ? 'light' : 'dark';
          applyTheme(next);
          return { mode: next };
        }),
    }),
    {
      name: 'daynest-theme',
      partialize: (s) => ({ mode: s.mode }),
    }
  )
);
