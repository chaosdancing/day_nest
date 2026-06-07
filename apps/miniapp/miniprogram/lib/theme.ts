import { themeStore } from '../stores/themeStore.js';

/**
 * Theme glue for pages. The dark CSS vars in styles/tokens.wxss are scoped to
 * `.dark` / `page.dark`, but WeChat gives us no handle on the <page> element —
 * so each page binds `{{theme}}` onto its ROOT view class and we keep that
 * field in sync with themeStore.resolved here.
 *
 * Usage in a Page():
 *   data: { theme: '' as '' | 'dark', … }
 *   onLoad()   { applyTheme(this); }
 *   onUnload() { disposeTheme(this); }
 *
 * `applyTheme` sets the field immediately AND subscribes, so toggling the mode
 * in 我的 flips every live page without a reload.
 */
interface ThemedPage {
  setData: (data: { theme: '' | 'dark' }) => void;
}

// Keyed by page instance so stacked instances (e.g. viewer → detail → viewer)
// each manage their own subscription without clobbering one another.
const subscriptions = new WeakMap<ThemedPage, () => void>();

export function applyTheme(page: ThemedPage): void {
  disposeTheme(page);
  const sync = (resolved: 'light' | 'dark'): void => {
    page.setData({ theme: resolved === 'dark' ? 'dark' : '' });
  };
  sync(themeStore.getState().resolved);
  subscriptions.set(
    page,
    themeStore.subscribe((s) => sync(s.resolved)),
  );
}

export function disposeTheme(page: ThemedPage): void {
  const unsub = subscriptions.get(page);
  if (unsub) {
    unsub();
    subscriptions.delete(page);
  }
}
