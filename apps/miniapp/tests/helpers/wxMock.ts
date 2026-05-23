export interface WxMockOptions {
  storage?: Record<string, unknown>;
  systemTheme?: 'light' | 'dark';
}

export interface WxMock {
  storage: Map<string, unknown>;
  requests: Array<{ url: string; method?: string; data?: unknown; header?: Record<string, string> }>;
  /** Configure the next wx.request response. Pop from the front per call. */
  queueResponse(res: { statusCode: number; data: unknown }): void;
  /** Configure the next wx.login response. */
  queueLogin(res: { code: string }): void;
  /** Capture wx.navigateTo / wx.reLaunch / wx.switchTab calls. */
  navStack: Array<{ kind: 'navigateTo' | 'reLaunch' | 'switchTab'; url: string }>;
}

export function installWxMock(opts: WxMockOptions = {}): WxMock {
  const storage = new Map<string, unknown>(Object.entries(opts.storage ?? {}));
  const requests: WxMock['requests'] = [];
  const requestQueue: Array<{ statusCode: number; data: unknown }> = [];
  const loginQueue: Array<{ code: string }> = [];
  const navStack: WxMock['navStack'] = [];

  const wx = {
    getStorageSync: (k: string) => storage.get(k) ?? '',
    setStorageSync: (k: string, v: unknown) => { storage.set(k, v); },
    removeStorageSync: (k: string) => { storage.delete(k); },
    clearStorageSync: () => { storage.clear(); },

    getSystemInfoSync: () => ({ theme: opts.systemTheme ?? 'light' }),
    onThemeChange: () => undefined,

    login: (o: { success?: (r: { code: string }) => void; fail?: (e: unknown) => void }) => {
      const next = loginQueue.shift();
      if (!next) {
        o.fail?.(new Error('no queued login response'));
        return;
      }
      Promise.resolve().then(() => o.success?.(next));
    },
    checkSession: (o: { success?: () => void; fail?: () => void }) => {
      Promise.resolve().then(() => o.success?.());
    },
    request: (o: {
      url: string;
      method?: string;
      data?: unknown;
      header?: Record<string, string>;
      success?: (r: { statusCode: number; data: unknown }) => void;
      fail?: (e: unknown) => void;
    }) => {
      requests.push({ url: o.url, method: o.method, data: o.data, header: o.header });
      const next = requestQueue.shift();
      if (!next) {
        o.fail?.(new Error('no queued response for ' + o.url));
        return { abort: () => undefined };
      }
      Promise.resolve().then(() => o.success?.(next));
      return { abort: () => undefined };
    },

    navigateTo: (o: { url: string }) => { navStack.push({ kind: 'navigateTo', url: o.url }); },
    reLaunch: (o: { url: string }) => { navStack.push({ kind: 'reLaunch', url: o.url }); },
    switchTab: (o: { url: string }) => { navStack.push({ kind: 'switchTab', url: o.url }); },

    showToast: () => undefined,
    showLoading: () => undefined,
    hideLoading: () => undefined,
    getNetworkType: (o: { success?: (r: { networkType: string }) => void }) => {
      Promise.resolve().then(() => o.success?.({ networkType: 'wifi' }));
    },
  };

  (globalThis as Record<string, unknown>).wx = wx;

  return {
    storage,
    requests,
    queueResponse: (r) => { requestQueue.push(r); },
    queueLogin: (r) => { loginQueue.push(r); },
    navStack,
  };
}

export function uninstallWxMock(): void {
  delete (globalThis as Record<string, unknown>).wx;
}
