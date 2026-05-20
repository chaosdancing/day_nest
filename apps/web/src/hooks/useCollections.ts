import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CollectionSummaryDTO,
  CollectionDetailDTO,
} from '@daynest/shared';

type ListResponse = {
  items: CollectionSummaryDTO[];
  nextCursor: string | null;
};

export function useCollections(params?: { tag?: string; limit?: number }) {
  const limit = params?.limit ?? 20;
  return useInfiniteQuery<ListResponse>({
    queryKey: ['collections', { tag: params?.tag, limit }],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<ListResponse>('/collections', {
        params: {
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(params?.tag ? { tag: params.tag } : {}),
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
