import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TagDTO } from '@daynest/shared';

export function useTags() {
  return useQuery<TagDTO[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api.get<TagDTO[]>('/tags');
      return res.data;
    },
  });
}

export type RenameTagResult = TagDTO & {
  photoCount: number;
  collectionCount: number;
  /** Whether the rename collided with an existing tag and was merged into it. */
  merged: boolean;
};

/**
 * Rename a tag and propagate the change to every collection and photo that
 * referenced it. When the target name collides with an existing tag, the
 * server merges the two and returns `merged: true` so the UI can let the
 * user know.
 */
export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation<
    RenameTagResult,
    Error,
    { currentName: string; displayName: string }
  >({
    mutationFn: async ({ currentName, displayName }) => {
      const res = await api.patch<RenameTagResult>(
        `/tags/${encodeURIComponent(currentName)}`,
        { displayName }
      );
      return res.data;
    },
    onSuccess: () => {
      // Tags overview + every collection list (timeline / by-tag / favorites)
      // can change their display label, so invalidate broadly.
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
