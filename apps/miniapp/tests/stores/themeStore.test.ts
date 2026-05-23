import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { themeStore, THEME_STORAGE_KEY } from '../../miniprogram/stores/themeStore.js';

describe('themeStore', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock({ systemTheme: 'light' });
    themeStore.reset();
  });
  afterEach(() => uninstallWxMock());

  it('defaults to system mode + light resolved', () => {
    themeStore.hydrate();
    expect(themeStore.getState().mode).toBe('system');
    expect(themeStore.getState().resolved).toBe('light');
  });

  it('resolved follows system theme when mode is system', () => {
    uninstallWxMock();
    mock = installWxMock({ systemTheme: 'dark' });
    themeStore.hydrate();
    expect(themeStore.getState().resolved).toBe('dark');
  });

  it('explicit light/dark overrides system theme', () => {
    mock = installWxMock({ systemTheme: 'dark' });
    themeStore.setMode('light');
    expect(themeStore.getState().resolved).toBe('light');
    themeStore.setMode('dark');
    expect(themeStore.getState().resolved).toBe('dark');
  });

  it('mode is persisted to storage', () => {
    themeStore.setMode('dark');
    expect(mock.storage.get(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('hydrate reads persisted mode', () => {
    mock.storage.set(THEME_STORAGE_KEY, 'dark');
    themeStore.hydrate();
    expect(themeStore.getState().mode).toBe('dark');
    expect(themeStore.getState().resolved).toBe('dark');
  });
});
