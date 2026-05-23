import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { collectionsService } from '../../../miniprogram/lib/services/collections.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

function fixtureSummary(id: string, title: string) {
  return {
    id,
    title,
    description: null,
    occurredOn: '2026-05-01',
    occurredUntil: null,
    location: null,
    coverPhoto: null,
    previewPhotos: [],
    tags: [],
    photoCount: 3,
    createdBy: '00000000-0000-0000-0000-000000000001',
  };
}

describe('collectionsService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('list() returns items + nextCursor and appends query params', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { items: [fixtureSummary('c1', 'Spring trip')], nextCursor: 'cur-next' },
    });
    const res = await collectionsService.list({ limit: 20, title: '春', dateFrom: '2026-01-01' });
    expect(res.items[0]?.title).toBe('Spring trip');
    expect(res.nextCursor).toBe('cur-next');
    const req = mock.requests[0];
    expect(req?.url).toMatch(/\/api\/collections\?/);
    expect(req?.url).toMatch(/limit=20/);
    expect(req?.url).toMatch(/title=%E6%98%A5/);
    expect(req?.url).toMatch(/dateFrom=2026-01-01/);
  });

  it('list() omits undefined params from the query string', async () => {
    mock.queueResponse({ statusCode: 200, data: { items: [], nextCursor: null } });
    await collectionsService.list({ limit: 30 });
    const url = mock.requests[0]?.url ?? '';
    expect(url).not.toContain('title=');
    expect(url).not.toContain('dateFrom=');
    expect(url).toMatch(/limit=30/);
  });

  it('get(id) hits /api/collections/:id', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { ...fixtureSummary('c2', 'Birthday'), photos: [] },
    });
    const res = await collectionsService.get('c2');
    expect(res.title).toBe('Birthday');
    expect(mock.requests[0]?.url).toMatch(/\/api\/collections\/c2$/);
  });

  it('list() throws on non-200', async () => {
    mock.queueResponse({ statusCode: 500, data: { error: { code: 'SERVER' } } });
    await expect(collectionsService.list({ limit: 30 })).rejects.toThrow(/server|500/i);
  });
});
