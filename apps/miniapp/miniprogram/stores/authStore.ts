import type { UserDTO } from '@daynest/shared';
import { createStore } from '../lib/store.js';
import { storage } from '../lib/storage.js';
import type { TokenProvider } from '../lib/api.js';

export const AUTH_STORAGE_KEYS = {
  access: 'daynest.auth.access',
  refresh: 'daynest.auth.refresh',
  user: 'daynest.auth.user',
} as const;

interface AuthState {
  user: UserDTO | null;
  accessToken: string;
  refreshToken: string;
  hydrated: boolean;
}

const store = createStore<AuthState>({
  user: null,
  accessToken: '',
  refreshToken: '',
  hydrated: false,
});

interface SetSessionInput {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

function persist(state: { user: UserDTO | null; accessToken: string; refreshToken: string }): void {
  if (state.accessToken) storage.set(AUTH_STORAGE_KEYS.access, state.accessToken);
  else storage.remove(AUTH_STORAGE_KEYS.access);
  if (state.refreshToken) storage.set(AUTH_STORAGE_KEYS.refresh, state.refreshToken);
  else storage.remove(AUTH_STORAGE_KEYS.refresh);
  if (state.user) storage.set(AUTH_STORAGE_KEYS.user, state.user);
  else storage.remove(AUTH_STORAGE_KEYS.user);
}

export const authStore = {
  getState: store.getState,
  subscribe: store.subscribe,

  hydrate(): void {
    const accessToken = storage.get<string>(AUTH_STORAGE_KEYS.access) ?? '';
    const refreshToken = storage.get<string>(AUTH_STORAGE_KEYS.refresh) ?? '';
    const user = storage.get<UserDTO>(AUTH_STORAGE_KEYS.user);
    store.setState({ accessToken, refreshToken, user, hydrated: true });
  },

  setSession(input: SetSessionInput): void {
    persist(input);
    store.setState({
      user: input.user,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      hydrated: true,
    });
  },

  setUser(user: UserDTO): void {
    persist({
      user,
      accessToken: store.getState().accessToken,
      refreshToken: store.getState().refreshToken,
    });
    store.setState({ user });
  },

  logout(): void {
    persist({ user: null, accessToken: '', refreshToken: '' });
    store.setState({ user: null, accessToken: '', refreshToken: '', hydrated: true });
  },

  getAccessToken: () => store.getState().accessToken,
  getRefreshToken: () => store.getState().refreshToken,
  setTokens(access: string, refresh: string): void {
    persist({ user: store.getState().user, accessToken: access, refreshToken: refresh });
    store.setState({ accessToken: access, refreshToken: refresh });
  },
  clearTokens(): void {
    persist({ user: null, accessToken: '', refreshToken: '' });
    store.setState({ user: null, accessToken: '', refreshToken: '' });
  },

  /** Test-only: forcibly reset to initial state without touching storage. */
  reset(): void {
    store.setState({ user: null, accessToken: '', refreshToken: '', hydrated: false });
  },
} satisfies TokenProvider & Record<string, unknown>;
