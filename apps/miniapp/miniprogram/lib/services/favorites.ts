import type { FavoriteEntryDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { ensureOk, qs } from './_http.js';
import { resolveApiBase } from '../config.js';

export interface ListFavoritesParams {
  limit?: number;
  cursor?: string;
}

export interface ListFavoritesResponse {
  items: FavoriteEntryDTO[];
  nextCursor: string | null;
}

export const favoritesService = {
  async list(params: ListFavoritesParams = {}): Promise<ListFavoritesResponse> {
    const url = `${resolveApiBase()}/api/favorites${qs(params as Record<string, string | number | undefined>)}`;
    const res = await apiClient.request<ListFavoritesResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async add(photoId: string): Promise<void> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/favorite`;
    const res = await apiClient.request<unknown>({ url, method: 'POST', data: {} });
    ensureOk('POST', url, res.statusCode, res.data);
  },

  async remove(photoId: string): Promise<void> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/favorite`;
    const res = await apiClient.request<unknown>({ url, method: 'DELETE' });
    ensureOk('DELETE', url, res.statusCode, res.data);
  },
};
