import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { env } from './env';
import { useAuthStore } from './auth';

export const api = axios.create({
  baseURL: env.apiBase,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshOnce(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await axios.post(
        `${env.apiBase}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const token = res.data?.accessToken as string | undefined;
      if (!token) return null;
      useAuthStore.getState().setAccessToken(token);
      if (res.data.user) useAuthStore.getState().setUser(res.data.user);
      return token;
    } catch {
      useAuthStore.getState().logout();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retried?: boolean })
      | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/auth/')
    ) {
      original._retried = true;
      const newToken = await refreshOnce();
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization =
          `Bearer ${newToken}`;
        return api.request(original);
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
