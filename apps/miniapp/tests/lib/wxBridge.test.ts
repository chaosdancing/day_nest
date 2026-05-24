import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { wxLogin, wxCheckSession } from '../../miniprogram/lib/wxBridge.js';

describe('wxBridge', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('wxLogin resolves with the queued code', async () => {
    mock.queueLogin({ code: 'wx-code-xyz' });
    const code = await wxLogin();
    expect(code).toBe('wx-code-xyz');
  });

  it('wxLogin rejects when the queue is empty', async () => {
    await expect(wxLogin()).rejects.toThrow(/no queued/);
  });

  it('wxCheckSession resolves true when wx says ok', async () => {
    await expect(wxCheckSession()).resolves.toBe(true);
  });

  it('wxCheckSession resolves false when wx fail-callback fires', async () => {
    (globalThis as Record<string, unknown>).wx = {
      checkSession: (o: { fail?: () => void }) => Promise.resolve().then(() => o.fail?.()),
    };
    await expect(wxCheckSession()).resolves.toBe(false);
  });
});
