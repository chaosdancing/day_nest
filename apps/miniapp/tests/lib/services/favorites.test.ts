import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { favoritesService } from '../../../miniprogram/lib/services/favorites.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('favoritesService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('list() returns items + nextCursor', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { items: [], nextCursor: null },
    });
    const res = await favoritesService.list({ limit: 30 });
    expect(res.items).toEqual([]);
    expect(res.nextCursor).toBeNull();
    expect(mock.requests[0]?.url).toMatch(/\/api\/favorites\?limit=30$/);
  });

  it('add(photoId) hits POST /api/photos/:id/favorite', async () => {
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await favoritesService.add('p1');
    expect(mock.requests[0]?.method).toBe('POST');
    expect(mock.requests[0]?.url).toMatch(/\/api\/photos\/p1\/favorite$/);
  });

  it('remove(photoId) hits DELETE /api/photos/:id/favorite', async () => {
    mock.queueResponse({ statusCode: 200, data: { ok: true } });
    await favoritesService.remove('p2');
    expect(mock.requests[0]?.method).toBe('DELETE');
    expect(mock.requests[0]?.url).toMatch(/\/api\/photos\/p2\/favorite$/);
  });

  it('add() throws on non-2xx', async () => {
    mock.queueResponse({ statusCode: 404, data: { error: { code: 'NOT_FOUND' } } });
    await expect(favoritesService.add('p3')).rejects.toThrow();
  });
});
