/**
 * WeChat share menu — must be enabled explicitly on many base libraries, and
 * re-enabled after pages that call `hideShareMenu` (e.g. login).
 */

/** Default landing when the user shares without a page-specific override. */
export const DEFAULT_SHARE_PATH = '/pages/timeline/index';

export const DEFAULT_SHARE_TITLE = '慢慢记 · 一家人的回忆相册';

export function enableShareMenu() {
  try {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  } catch {
    try {
      wx.showShareMenu({ withShareTicket: true });
    } catch {
      // ignore — very old clients
    }
  }
}

export function disableShareMenu() {
  try {
    wx.hideShareMenu();
  } catch {
    // ignore
  }
}
