import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { authStore, AUTH_STORAGE_KEYS } from '../../miniprogram/stores/authStore.js';

describe('authStore', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
  });
  afterEach(() => uninstallWxMock());

  it('initial state is signed out', () => {
    expect(authStore.getState()).toEqual({
      user: null,
      accessToken: '',
      refreshToken: '',
      hydrated: false,
    });
  });

  it('hydrate() reads tokens + user from storage', () => {
    mock.storage.set(AUTH_STORAGE_KEYS.access, 'a1');
    mock.storage.set(AUTH_STORAGE_KEYS.refresh, 'r1');
    mock.storage.set(AUTH_STORAGE_KEYS.user, {
      id: 'u1', username: 'mom', displayName: '妈妈', avatarKey: null, hasWechatBound: true,
    });
    authStore.hydrate();
    expect(authStore.getState().hydrated).toBe(true);
    expect(authStore.getState().accessToken).toBe('a1');
    expect(authStore.getState().user?.username).toBe('mom');
  });

  it('setSession persists tokens and user to storage', () => {
    authStore.setSession({
      user: { id: 'u2', username: 'dad', displayName: '爸爸', avatarKey: null, hasWechatBound: true, canUpload: true },
      accessToken: 'a2',
      refreshToken: 'r2',
    });
    expect(mock.storage.get(AUTH_STORAGE_KEYS.access)).toBe('a2');
    expect(mock.storage.get(AUTH_STORAGE_KEYS.refresh)).toBe('r2');
    expect((mock.storage.get(AUTH_STORAGE_KEYS.user) as { username: string }).username).toBe('dad');
  });

  it('logout clears state and storage', () => {
    authStore.setSession({
      user: { id: 'u3', username: 'x', displayName: 'X', avatarKey: null, hasWechatBound: true, canUpload: true },
      accessToken: 'a3',
      refreshToken: 'r3',
    });
    authStore.logout();
    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().accessToken).toBe('');
    expect(mock.storage.has(AUTH_STORAGE_KEYS.access)).toBe(false);
    expect(mock.storage.has(AUTH_STORAGE_KEYS.user)).toBe(false);
  });

  it('exposes TokenProvider compatible methods', () => {
    authStore.setSession({
      user: { id: 'u', username: 'u', displayName: 'U', avatarKey: null, hasWechatBound: false, canUpload: true },
      accessToken: 'a4',
      refreshToken: 'r4',
    });
    expect(authStore.getAccessToken()).toBe('a4');
    expect(authStore.getRefreshToken()).toBe('r4');
    authStore.setTokens('a5', 'r5');
    expect(authStore.getAccessToken()).toBe('a5');
    authStore.clearTokens();
    expect(authStore.getAccessToken()).toBe('');
    expect(authStore.getState().user).toBeNull();
  });
});
