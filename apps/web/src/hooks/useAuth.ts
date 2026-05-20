import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import type { UserDTO } from '@daynest/shared';

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const me = useQuery({
    queryKey: ['me'],
    enabled: !!accessToken,
    queryFn: async () => {
      const res = await api.get<{ user: UserDTO }>('/auth/me');
      setUser(res.data.user);
      return res.data.user;
    },
  });

  return {
    user: me.data ?? user,
    isAuthenticated: !!accessToken,
    isLoading: !!accessToken && me.isLoading,
    logout: async () => {
      try {
        await api.post('/auth/logout');
      } catch {
        // ignore
      }
      logout();
    },
  };
}
