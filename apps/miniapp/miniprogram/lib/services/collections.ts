import type {
  CollectionDetailDTO,
  CollectionSummaryDTO,
  CollectionCreateInput,
  CollectionAppendInput,
} from '@daynest/shared';
import { apiClient } from './_client.js';
import { ensureOk, qs } from './_http.js';
import { resolveApiBase } from '../config.js';

export interface ListCollectionsParams {
  limit?: number;
  cursor?: string;
  title?: string;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  tag?: string;
  tagScope?: 'all' | 'collection' | 'photo';
}

export interface ListCollectionsResponse {
  items: CollectionSummaryDTO[];
  nextCursor: string | null;
}

export interface ByTitleMatch {
  collection: CollectionDetailDTO;
  directTags: string[];
  score: number;
  matchType: 'exact' | 'contains' | 'subsequence';
}

export interface ByTitleResponse {
  collection: CollectionDetailDTO | null;
  directTags: string[];
  matches: ByTitleMatch[];
}

export const collectionsService = {
  async list(params: ListCollectionsParams = {}): Promise<ListCollectionsResponse> {
    const url = `${resolveApiBase()}/api/collections${qs(params as Record<string, string | number | undefined>)}`;
    const res = await apiClient.request<ListCollectionsResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async get(id: string): Promise<CollectionDetailDTO> {
    const url = `${resolveApiBase()}/api/collections/${encodeURIComponent(id)}`;
    const res = await apiClient.request<CollectionDetailDTO>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async create(body: CollectionCreateInput): Promise<CollectionDetailDTO> {
    const url = `${resolveApiBase()}/api/collections`;
    const res = await apiClient.request<CollectionDetailDTO>({
      url,
      method: 'POST',
      data: body,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data;
  },

  async append(id: string, body: CollectionAppendInput): Promise<CollectionDetailDTO> {
    const url = `${resolveApiBase()}/api/collections/${encodeURIComponent(id)}/append`;
    const res = await apiClient.request<CollectionDetailDTO>({
      url,
      method: 'POST',
      data: body,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data;
  },

  async byTitle(title: string): Promise<ByTitleResponse> {
    const url = `${resolveApiBase()}/api/collections/by-title?title=${encodeURIComponent(title)}`;
    const res = await apiClient.request<ByTitleResponse>({ url, method: 'GET' });
    ensureOk('GET', url, res.statusCode, res.data);
    return res.data;
  },
};
