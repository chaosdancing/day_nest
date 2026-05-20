import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserDTO } from '@daynest/shared';

type AuthState = {
  user: UserDTO | null;
  accessToken: string | null;
  setAuth: (user: UserDTO, accessToken: string) => void;
  setUser: (user: UserDTO) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      setUser: (user) => set({ user }),
      setAccessToken: (token) => set({ accessToken: token }),
      logout: () => set({ user: null, accessToken: null }),
    }),
    { name: 'daynest-auth' }
  )
);
