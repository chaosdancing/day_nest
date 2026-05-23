import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';

export interface PhotoUrlResponse {
  url: string;
  expiresAt: string;
}

export const photosService = {
  async getUrl(photoId: string): Promise<PhotoUrlResponse> {
    const url = `${resolveApiBase()}/api/photos/${encodeURIComponent(photoId)}/url`;
    const res = await apiClient.request<PhotoUrlResponse>({ url, method: 'GET' });
    if (res.statusCode !== 200) {
      const code = (res.data as { error?: { code?: string } })?.error?.code ?? `HTTP_${res.statusCode}`;
      throw new Error(`GET ${url} -> ${res.statusCode} ${code}`);
    }
    return res.data;
  },
};
