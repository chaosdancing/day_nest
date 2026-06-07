/**
 * Cross-tab slide direction hand-off.
 *
 * Native tabBar pages can't finger-swipe between each other, so we fake a
 * directional slide on the incoming page's content. The custom tab bar records
 * which way we're moving (higher index → from the right, lower → from the left)
 * right before `wx.switchTab`, and the target page reads it once in `onShow` to
 * play a one-shot CSS slide-in.
 *
 * This is a module singleton: the same module instance is shared by the tab bar
 * component and every tab page, so a value written here is visible there.
 */
export type TabSlide = '' | 'slide-in-right' | 'slide-in-left';

let pending: TabSlide = '';

/** Record the slide direction for a switch from `fromIndex` to `toIndex`. */
export function recordTabSwitch(fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) {
    pending = '';
    return;
  }
  pending = toIndex > fromIndex ? 'slide-in-right' : 'slide-in-left';
}

/** Read and clear the pending direction. Returns '' when there is none. */
export function consumeTabSlide(): TabSlide {
  const dir = pending;
  pending = '';
  return dir;
}
