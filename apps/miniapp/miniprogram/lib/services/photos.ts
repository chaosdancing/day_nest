import { apiClient } from './_client.js';
import { ensureOk } from './_http.js';
import { resolveApiBase } from '../config.js';

export interface PhotoUrlResponse {
  url: string;
  expiresAt: string;
}

export const photosService = {
  async getUrl(photoId: string): Promise<PhotoUrlResponse> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/url`;
    const res = await apiClient.request<PhotoUrlResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },
};
