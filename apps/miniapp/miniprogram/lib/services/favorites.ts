import type { FavoriteEntryDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';

export interface ListFavoritesParams {
  limit?: number;
  cursor?: string;
}

export interface ListFavoritesResponse {
  items: FavoriteEntryDTO[];
  nextCursor: string | null;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function ensureOk(method: string, url: string, statusCode: number, body: unknown): Promise<void> {
  if (statusCode >= 200 && statusCode < 300) return;
  const code = (body as { error?: { code?: string } })?.error?.code ?? `HTTP_${statusCode}`;
  throw new Error(`${method} ${url} -> ${statusCode} ${code}`);
}

export const favoritesService = {
  async list(params: ListFavoritesParams = {}): Promise<ListFavoritesResponse> {
    const url = `${resolveApiBase()}/api/favorites${qs(params as Record<string, string | number | undefined>)}`;
    const res = await apiClient.request<ListFavoritesResponse>({ url, method: 'GET' });
    await ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async add(photoId: string): Promise<void> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/favorite`;
    const res = await apiClient.request<unknown>({ url, method: 'POST', data: {} });
    await ensureOk('POST', url, res.statusCode, res.data);
  },

  async remove(photoId: string): Promise<void> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/favorite`;
    const res = await apiClient.request<unknown>({ url, method: 'DELETE' });
    await ensureOk('DELETE', url, res.statusCode, res.data);
  },
};
