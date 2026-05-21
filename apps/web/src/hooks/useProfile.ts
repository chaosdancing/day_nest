import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import type { UpdateProfileInput, UserDTO } from '@daynest/shared';

/**
 * Mutation for `PATCH /api/auth/me`. On success we update the auth store
 * so the header / settings page immediately reflect the new display
 * name, then invalidate `me` so any background refetch picks up the
 * canonical value.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const res = await api.patch<{ user: UserDTO }>('/auth/me', input);
      return res.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
