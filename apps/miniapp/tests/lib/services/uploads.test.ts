import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { uploadsService } from '../../../miniprogram/lib/services/uploads.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('uploadsService.requestTokens', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('POSTs to /api/uploads/token with the body', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        tokens: [
          { token: 't1', key: 'k1.jpg', uploadUrl: 'https://up.q.io', expiresAt: '2026-12-31T00:00:00Z' },
          { token: 't2', key: 'k2.jpg', uploadUrl: 'https://up.q.io', expiresAt: '2026-12-31T00:00:00Z' },
        ],
      },
    });
    const out = await uploadsService.requestTokens({ ext: 'jpg', count: 2 });
    expect(out.length).toBe(2);
    expect(out[0]?.token).toBe('t1');
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/uploads\/token$/);
    expect(req?.data).toEqual({ ext: 'jpg', count: 2 });
  });

  it('passes collectionDraftId when given', async () => {
    mock.queueResponse({ statusCode: 200, data: { tokens: [] } });
    await uploadsService.requestTokens({ ext: 'jpg', count: 1, collectionDraftId: 'draft-123' });
    expect(mock.requests[0]?.data).toEqual({ ext: 'jpg', count: 1, collectionDraftId: 'draft-123' });
  });
});

describe('uploadsService.uploadToQiniu', () => {
  let mock: WxMock;
  beforeEach(() => { mock = installWxMock(); });
  afterEach(() => uninstallWxMock());

  it('multipart POSTs to the upload URL with token + key + file field', async () => {
    mock.queueUploadFile({
      statusCode: 200,
      data: JSON.stringify({ key: 'k1.jpg', hash: 'abc', size: 12345, width: 1600, height: 1200 }),
    });
    const out = await uploadsService.uploadToQiniu({
      token: 't1', key: 'k1.jpg', uploadUrl: 'https://up.q.io', filePath: 'wxfile://x.jpg',
    });
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    const call = mock.uploadFileCalls[0];
    expect(call?.url).toBe('https://up.q.io');
    expect(call?.name).toBe('file');
    expect(call?.formData).toEqual({ token: 't1', key: 'k1.jpg' });
    expect(call?.filePath).toBe('wxfile://x.jpg');
  });

  it('normalizes Qiniu image dimensions from strings to numbers', async () => {
    mock.queueUploadFile({
      statusCode: 200,
      data: JSON.stringify({ key: 'k1.jpg', hash: 'abc', size: '12345', width: '1600', height: '1200' }),
    });
    const out = await uploadsService.uploadToQiniu({
      token: 't1', key: 'k1.jpg', uploadUrl: 'https://up.q.io', filePath: 'wxfile://x.jpg',
    });
    expect(out.size).toBe(12345);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
  });

  it('rejects when qiniu returns non-200', async () => {
    mock.queueUploadFile({ statusCode: 401, data: '{"error":"bad token"}' });
    await expect(uploadsService.uploadToQiniu({
      token: 't', key: 'k', uploadUrl: 'https://up', filePath: 'wxfile://x',
    })).rejects.toThrow(/401/);
  });

  it('rejects when qiniu returns malformed JSON', async () => {
    mock.queueUploadFile({ statusCode: 200, data: 'not json' });
    await expect(uploadsService.uploadToQiniu({
      token: 't', key: 'k', uploadUrl: 'https://up', filePath: 'wxfile://x',
    })).rejects.toBeDefined();
  });
});
