import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { tagsService } from '../../../miniprogram/lib/services/tags.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('tagsService.rename', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('hits PATCH /api/tags/<name> with { displayName }', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        id: 't1',
        name: 'birthday',
        displayName: 'Birthday',
        photoCount: 3,
        collectionCount: 1,
        merged: false,
      },
    });
    const res = await tagsService.rename('Birthday', 'Birthday');
    expect(res.merged).toBe(false);
    expect(res.displayName).toBe('Birthday');
    const req = mock.requests[0];
    expect(req?.method).toBe('PATCH');
    expect(req?.url).toMatch(/\/api\/tags\/Birthday$/);
    expect(req?.data).toEqual({ displayName: 'Birthday' });
  });

  it('URL-encodes the current normalized name', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        id: 't2',
        name: '生日',
        displayName: '生日',
        photoCount: 0,
        collectionCount: 0,
        merged: false,
      },
    });
    await tagsService.rename('生日', '生日');
    expect(mock.requests[0]?.url).toMatch(/\/api\/tags\/%E7%94%9F%E6%97%A5$/);
  });

  it('returns { merged: true } when the api merges', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        id: 't3',
        name: 'travel',
        displayName: 'Travel',
        photoCount: 10,
        collectionCount: 4,
        merged: true,
      },
    });
    const res = await tagsService.rename('Trip', 'Travel');
    expect(res.merged).toBe(true);
    expect(res.id).toBe('t3');
  });

  it('throws on non-2xx with the api error code in the message', async () => {
    mock.queueResponse({
      statusCode: 404,
      data: { code: 'TAG_NOT_FOUND', message: 'tag not found' },
    });
    await expect(tagsService.rename('ghost', 'New')).rejects.toThrow(/TAG_NOT_FOUND/);
  });
});
