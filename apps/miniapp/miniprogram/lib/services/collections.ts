import type { CollectionSummaryDTO, CollectionDetailDTO } from '@daynest/shared';
import { apiClient } from './_client.js';
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

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function fail<T>(method: string, url: string, statusCode: number, body: unknown): Promise<T> {
  const code =
    (body as { error?: { code?: string } })?.error?.code ?? `HTTP_${statusCode}`;
  throw new Error(`${method} ${url} -> ${statusCode} ${code}`);
}

export const collectionsService = {
  async list(params: ListCollectionsParams = {}): Promise<ListCollectionsResponse> {
    const url = `${resolveApiBase()}/api/collections${qs(params as Record<string, string | number | undefined>)}`;
    const res = await apiClient.request<ListCollectionsResponse>({ url, method: 'GET' });
    if (res.statusCode !== 200) return fail('GET', url, res.statusCode, res.data);
    return res.data;
  },

  async get(id: string): Promise<CollectionDetailDTO> {
    const url = `${resolveApiBase()}/api/collections/${encodeURIComponent(id)}`;
    const res = await apiClient.request<CollectionDetailDTO>({ url, method: 'GET' });
    if (res.statusCode !== 200) return fail('GET', url, res.statusCode, res.data);
    return res.data;
  },
};
