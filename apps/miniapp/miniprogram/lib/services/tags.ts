import type { TagDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';
import { ensureOk } from './_http.js';

export interface TagRenameResponse extends TagDTO {
  merged: boolean;
}

export const tagsService = {
  async list(): Promise<TagDTO[]> {
    const url = `${resolveApiBase()}/api/tags`;
    const res = await apiClient.request<TagDTO[]>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async rename(currentName: string, displayName: string): Promise<TagRenameResponse> {
    const url = `${resolveApiBase()}/api/tags/${encodeURIComponent(currentName)}`;
    const res = await apiClient.request<TagRenameResponse>({
      url,
      method: 'PATCH',
      data: { displayName },
    });
    ensureOk('PATCH', url, res.statusCode, res.data);
    return res.data;
  },
};
