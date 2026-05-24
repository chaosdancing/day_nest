import { createApiClient } from '../api.js';
import { endpoints } from '../endpoints.js';
import { authStore } from '../../stores/authStore.js';

/**
 * Auth-failure redirect with a debounce window to handle bursts of 401s
 * from parallel requests. Without this, every in-flight request would
 * trigger its own redirect attempt and the second `wx.reLaunch` would
 * usually fail with "redirectTo:fail" toasts on top of the real error.
 */
let lastRedirectAt = 0;
function redirectToLogin(): void {
  const now = Date.now();
  if (now - lastRedirectAt < 1500) return;
  lastRedirectAt = now;
  // We use reLaunch (not redirectTo) so the back-stack is clean — the user
  // must log in again, there's nothing useful to return to.
  wx.reLaunch({
    url: '/pages/login/index',
    // No fail handler — if we're already on the login page reLaunch is a
    // no-op and the error is harmless.
  });
  wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
}

/**
 * Process-wide singleton API client. All service modules share this so that
 * concurrent 401s on different endpoints collapse into a single refresh via
 * the api client's `inflightRefresh` promise.
 */
export const apiClient = createApiClient({
  tokens: authStore,
  refreshUrl: endpoints.refreshToken(),
  onAuthFailure: redirectToLogin,
});
