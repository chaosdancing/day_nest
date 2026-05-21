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

export type TagScope = 'any' | 'collection' | 'photo';

export type CollectionListParams = {
  tag?: string;
  /**
   * When `tag` is set, controls which tag source we filter on:
   *   - 'any'        (default) collections tagged directly OR via any photo
   *   - 'collection'           only direct collection-level tags
   *   - 'photo'                only tags applied via a contained photo
   * Used by the Tags overview/pinboard to distinguish "this is a
   * collection tag" from "this is a per-photo tag".
   */
  tagScope?: TagScope;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  /** Fuzzy substring match against collection title. */
  title?: string;
};

export function useCollections(params?: CollectionListParams) {
  const limit = params?.limit ?? 20;
  return useInfiniteQuery<ListResponse>({
    queryKey: [
      'collections',
      {
        tag: params?.tag,
        tagScope: params?.tagScope,
        limit,
        dateFrom: params?.dateFrom,
        dateTo: params?.dateTo,
        location: params?.location,
        title: params?.title,
      },
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<ListResponse>('/collections', {
        params: {
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(params?.tag ? { tag: params.tag } : {}),
          // Only send tagScope when it's a non-default value AND a tag
          // is actually being filtered — otherwise the server short-
          // circuits on `tag` anyway and the query key stays clean.
          ...(params?.tag && params?.tagScope && params.tagScope !== 'any'
            ? { tagScope: params.tagScope }
            : {}),
          ...(params?.dateFrom ? { dateFrom: params.dateFrom } : {}),
          ...(params?.dateTo ? { dateTo: params.dateTo } : {}),
          ...(params?.location ? { location: params.location } : {}),
          ...(params?.title ? { title: params.title } : {}),
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

/**
 * Look up similar collections by title for the "merge into existing"
 * flow on the upload page.
 *
 * NOTE: The caller MUST debounce the title themselves (the previous
 * version of this hook had a built-in `useDebounced` wrapper, but it
 * misbehaved during Chinese / Japanese pinyin input — it would fire
 * lookups on the intermediate roman characters before the IME had
 * committed a CJK glyph). Pass a pre-trimmed, IME-aware debounced
 * value via `useIMEDebouncedValue`.
 */
export function useCollectionByTitle(title: string) {
  const trimmed = title.trim();
  return useQuery<CollectionByTitleResponse>({
    queryKey: ['collection-by-title', trimmed],
    enabled: trimmed.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get<CollectionByTitleResponse>(
        '/collections/by-title',
        { params: { title: trimmed } }
      );
      return res.data;
    },
  });
}
