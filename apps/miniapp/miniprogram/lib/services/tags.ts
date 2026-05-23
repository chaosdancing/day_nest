import type { TagDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';

export const tagsService = {
  async list(): Promise<TagDTO[]> {
    const url = `${resolveApiBase()}/api/tags`;
    const res = await apiClient.request<TagDTO[]>({ url, method: 'GET' });
    if (res.statusCode !== 200) {
      const code = (res.data as { error?: { code?: string } })?.error?.code ?? `HTTP_${res.statusCode}`;
      throw new Error(`GET ${url} -> ${res.statusCode} ${code}`);
    }
    return res.data;
  },
};
