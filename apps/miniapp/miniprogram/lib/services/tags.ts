import type { PhotoDTO, TagDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
import { resolveApiBase } from '../config.js';
import { ensureOk, qs } from './_http.js';

export interface TagRenameResponse extends TagDTO {
  merged: boolean;
}

export interface TaggedPhotoItem {
  photo: PhotoDTO;
  collection: {
    id: string;
    title: string;
    occurredOn: string;
    location: string | null;
  };
}

export interface TaggedPhotosResponse {
  items: TaggedPhotoItem[];
  nextCursor: string | null;
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

  async photos(
    tagName: string,
    params: { limit?: number; cursor?: string | null } = {},
  ): Promise<TaggedPhotosResponse> {
    const url = `${resolveApiBase()}/api/tags/${encodeURIComponent(tagName)}/photos${qs(params)}`;
    const res = await apiClient.request<TaggedPhotosResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },
};
