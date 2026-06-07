import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  FavoriteEntryDTO,
  FavoritesListResponse,
  PhotoDTO,
} from '@daynest/shared';

export type FavoritesScope = 'all' | 'mine';

export function useFavorites(scope: FavoritesScope = 'all') {
  return useInfiniteQuery<FavoritesListResponse>({
    // Scope is part of the key so 全家最爱 / 只看我的 cache independently and
    // the toggle swaps instantly without cross-contaminating pages.
    queryKey: ['favorites', scope],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<FavoritesListResponse>('/favorites', {
        params: { scope, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return res.data;
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation<
    PhotoDTO,
    Error,
    { photoId: string; favorited: boolean; collectionId?: string }
  >({
    mutationFn: async ({ photoId, favorited }) => {
      const res = favorited
        ? await api.post<PhotoDTO>(`/photos/${photoId}/favorite`)
        // Some browser/proxy combinations preserve `content-type:
        // application/json` on DELETE but send an empty body, which Fastify
        // rejects before the route runs. Send an explicit empty JSON object
        // so the request is well-formed while the route still ignores body.
        : await api.delete<PhotoDTO>(`/photos/${photoId}/favorite`, { data: {} });
      return res.data;
    },
    onSuccess: (photo, vars) => {
      qc.invalidateQueries({ queryKey: ['favorites'] });
      if (vars.collectionId) {
        qc.invalidateQueries({ queryKey: ['collection', vars.collectionId] });
      } else {
        qc.invalidateQueries({ queryKey: ['collection', photo.collectionId] });
      }
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export type { FavoriteEntryDTO };
