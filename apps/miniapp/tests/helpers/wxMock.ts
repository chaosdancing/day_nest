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
  /** Configure the next wx.getImageInfo success payload. */
  queueImageInfo(r: { width: number; height: number }): void;
  /** Configure the next wx.compressImage success payload. */
  queueCompressResult(r: { tempFilePath: string }): void;
  /** Configure the next wx.uploadFile success payload. */
  queueUploadFile(r: { statusCode: number; data: string }): void;
  /** Captures every wx.uploadFile call in order. */
  uploadFileCalls: Array<{ url: string; filePath: string; name: string; formData: Record<string, string> }>;
}

export function installWxMock(opts: WxMockOptions = {}): WxMock {
  const storage = new Map<string, unknown>(Object.entries(opts.storage ?? {}));
  const requests: WxMock['requests'] = [];
  const requestQueue: Array<{ statusCode: number; data: unknown }> = [];
  const loginQueue: Array<{ code: string }> = [];
  const imageInfoQueue: Array<{ width: number; height: number }> = [];
  const compressQueue: Array<{ tempFilePath: string }> = [];
  const uploadQueueResults: Array<{ statusCode: number; data: string }> = [];
  const uploadFileCalls: WxMock['uploadFileCalls'] = [];
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

    getImageInfo: (o: {
      src: string;
      success?: (r: { width: number; height: number }) => void;
      fail?: (e: unknown) => void;
    }) => {
      const next = imageInfoQueue.shift();
      if (!next) {
        o.fail?.(new Error('no queued image info'));
        return;
      }
      Promise.resolve().then(() => o.success?.(next));
    },
    compressImage: (o: {
      src: string;
      quality?: number;
      compressedWidth?: number;
      compressedHeight?: number;
      success?: (r: { tempFilePath: string }) => void;
      fail?: (e: unknown) => void;
    }) => {
      const next = compressQueue.shift();
      if (!next) {
        o.fail?.(new Error('no queued compress result'));
        return;
      }
      Promise.resolve().then(() => o.success?.(next));
    },
    uploadFile: (o: {
      url: string;
      filePath: string;
      name: string;
      formData: Record<string, string>;
      success?: (r: { statusCode: number; data: string }) => void;
      fail?: (e: unknown) => void;
    }) => {
      uploadFileCalls.push({ url: o.url, filePath: o.filePath, name: o.name, formData: o.formData });
      const next = uploadQueueResults.shift();
      if (!next) {
        o.fail?.(new Error('no queued uploadFile result'));
        return { abort: () => undefined };
      }
      Promise.resolve().then(() => o.success?.(next));
      return { abort: () => undefined };
    },
  };

  (globalThis as Record<string, unknown>).wx = wx;

  return {
    storage,
    requests,
    queueResponse: (r) => { requestQueue.push(r); },
    queueLogin: (r) => { loginQueue.push(r); },
    navStack,
    queueImageInfo: (r) => { imageInfoQueue.push(r); },
    queueCompressResult: (r) => { compressQueue.push(r); },
    queueUploadFile: (r) => { uploadQueueResults.push(r); },
    uploadFileCalls,
  };
}

export function uninstallWxMock(): void {
  delete (globalThis as Record<string, unknown>).wx;
}
