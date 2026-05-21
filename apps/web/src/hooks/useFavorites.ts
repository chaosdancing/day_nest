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

export function useFavorites() {
  return useInfiniteQuery<FavoritesListResponse>({
    queryKey: ['favorites'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<FavoritesListResponse>('/favorites', {
        params: pageParam ? { cursor: pageParam } : {},
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
        : await api.delete<PhotoDTO>(`/photos/${photoId}/favorite`);
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
