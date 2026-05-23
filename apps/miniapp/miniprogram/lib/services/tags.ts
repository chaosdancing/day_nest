import type { TagDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { ensureOk } from './_http.js';
import { resolveApiBase } from '../config.js';

export const tagsService = {
  async list(): Promise<TagDTO[]> {
    const url = `${resolveApiBase()}/api/tags`;
    const res = await apiClient.request<TagDTO[]>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },
};
