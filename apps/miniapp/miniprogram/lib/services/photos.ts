import type { PhotoDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { ensureOk } from './_http.js';
import { resolveApiBase } from '../config.js';
import { bumpContentVersion } from '../contentVersion.js';

export interface PhotoUrlResponse {
  url: string;
  expiresAt: string;
}

export interface PhotoUpdateInput {
  caption?: string | null;
  orderIndex?: number;
  tags?: string[];
}

export const photosService = {
  async getUrl(photoId: string): Promise<PhotoUrlResponse> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/url`;
    const res = await apiClient.request<PhotoUrlResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async update(id: string, body: PhotoUpdateInput): Promise<PhotoDTO> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(id)}`;
    const res = await apiClient.request<PhotoDTO>({
      url,
      method: 'PATCH',
      data: body,
    });
    ensureOk('PATCH', url, res.statusCode, res.data);
    bumpContentVersion();
    return res.data;
  },
};
