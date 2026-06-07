import type { FavoriteEntryDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { ensureOk, qs } from './_http.js';
import { resolveApiBase } from '../config.js';
import { bumpContentVersion } from '../contentVersion.js';

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
    bumpContentVersion();
  },

  async remove(photoId: string): Promise<void> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/favorite`;
    // Keep DELETE JSON-shaped across runtimes. Fastify rejects
    // `content-type: application/json` with an empty body before the route
    // handler runs, and some clients/proxies attach that header implicitly.
    const res = await apiClient.request<unknown>({ url, method: 'DELETE', data: {} });
    ensureOk('DELETE', url, res.statusCode, res.data);
    bumpContentVersion();
  },
};
