export interface TokenProvider {
  getAccessToken(): string;
  getRefreshToken(): string;
  setTokens(access: string, refresh: string): void;
  clearTokens(): void;
}

export interface ApiRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  data?: unknown;
  header?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  statusCode: number;
  data: T;
}

export interface ApiClient {
  request<T = unknown>(req: ApiRequest): Promise<ApiResponse<T>>;
}

export interface ApiClientOptions {
  tokens: TokenProvider;
  refreshUrl: string;
  /**
   * Called when an authenticated request fails 401 and refresh has been
   * exhausted (no refresh token, or refresh request itself rejected).
   * Wired up at app boot to redirect to /pages/login/index so the user
   * doesn't get stuck behind silent "操作失败" toasts.
   *
   * Pure-API tests pass no handler — they consume the returned 401 directly.
   */
  onAuthFailure?: () => void;
}

function wxRequest<T>(req: ApiRequest): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: req.url,
      method: (req.method ?? 'GET') as WechatMiniprogram.RequestOption['method'],
      data: req.data as WechatMiniprogram.RequestOption['data'],
      header: req.header,
      success: (r) => resolve({ statusCode: r.statusCode, data: r.data as T }),
      fail: (e) => reject(e instanceof Error ? e : new Error(String(e))),
    });
  });
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  let inflightRefresh: Promise<boolean> | null = null;

  async function refreshOnce(): Promise<boolean> {
    if (inflightRefresh) return inflightRefresh;
    const refresh = opts.tokens.getRefreshToken();
    if (!refresh) {
      opts.tokens.clearTokens();
      return false;
    }
    inflightRefresh = (async () => {
      try {
        const res = await wxRequest<{ accessToken?: string; refreshToken?: string }>({
          url: opts.refreshUrl,
          method: 'POST',
          data: { refreshToken: refresh },
          header: { 'content-type': 'application/json' },
        });
        if (res.statusCode === 200 && res.data.accessToken && res.data.refreshToken) {
          opts.tokens.setTokens(res.data.accessToken, res.data.refreshToken);
          return true;
        }
        opts.tokens.clearTokens();
        return false;
      } finally {
        inflightRefresh = null;
      }
    })();
    return inflightRefresh;
  }

  async function send<T>(req: ApiRequest, allowRetry: boolean): Promise<ApiResponse<T>> {
    const header: Record<string, string> = { ...(req.header ?? {}) };
    if (req.data !== undefined && header['content-type'] === undefined) {
      header['content-type'] = 'application/json';
    }
    const access = opts.tokens.getAccessToken();
    if (access) header.Authorization = `Bearer ${access}`;
    const res = await wxRequest<T>({ ...req, header });
    if (res.statusCode === 401 && allowRetry && req.url !== opts.refreshUrl) {
      const ok = await refreshOnce();
      if (ok) return send<T>(req, false);
      // Refresh failed (no refresh token or refresh rejected). Surface this
      // to the host app so it can kick the user back to login instead of
      // letting pages show generic "操作失败" toasts forever.
      opts.onAuthFailure?.();
    }
    return res;
  }

  return {
    request<T>(req: ApiRequest) {
      return send<T>(req, true);
    },
  };
}
