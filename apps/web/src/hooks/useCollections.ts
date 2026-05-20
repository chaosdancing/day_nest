import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CollectionSummaryDTO,
  CollectionDetailDTO,
} from '@daynest/shared';
import { useEffect, useState } from 'react';

type ListResponse = {
  items: CollectionSummaryDTO[];
  nextCursor: string | null;
};

export type CollectionListParams = {
  tag?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
};

export function useCollections(params?: CollectionListParams) {
  const limit = params?.limit ?? 20;
  return useInfiniteQuery<ListResponse>({
    queryKey: [
      'collections',
      {
        tag: params?.tag,
        limit,
        dateFrom: params?.dateFrom,
        dateTo: params?.dateTo,
        location: params?.location,
      },
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<ListResponse>('/collections', {
        params: {
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(params?.tag ? { tag: params.tag } : {}),
          ...(params?.dateFrom ? { dateFrom: params.dateFrom } : {}),
          ...(params?.dateTo ? { dateTo: params.dateTo } : {}),
          ...(params?.location ? { location: params.location } : {}),
        },
      });
      return res.data;
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useCollection(id: string | undefined) {
  return useQuery<CollectionDetailDTO>({
    queryKey: ['collection', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get<CollectionDetailDTO>(`/collections/${id}`);
      return res.data;
    },
  });
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export type CollectionByTitleResponse = {
  collection: CollectionDetailDTO | null;
  directTags: string[];
  matches: Array<{
    collection: CollectionDetailDTO;
    directTags: string[];
    score: number;
    matchType: 'exact' | 'contains' | 'subsequence';
  }>;
};

export function useCollectionByTitle(rawTitle: string) {
  const title = useDebounced(rawTitle.trim(), 350);
  return useQuery<CollectionByTitleResponse>({
    queryKey: ['collection-by-title', title],
    enabled: title.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<CollectionByTitleResponse>(
        '/collections/by-title',
        { params: { title } }
      );
      return res.data;
    },
  });
}
