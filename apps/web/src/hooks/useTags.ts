import { useQuery } from '@tanstack/react-query';
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
