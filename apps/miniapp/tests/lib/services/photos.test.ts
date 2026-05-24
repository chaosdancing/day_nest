import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';
import { photosService } from '../../../miniprogram/lib/services/photos.js';

describe('photosService.update', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('PATCHes photo caption and tags', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: {
        id: 'p1',
        collectionId: 'c1',
        fileKey: 'k',
        width: 100,
        height: 100,
        caption: 'hello',
        takenAt: null,
        orderIndex: 0,
        uploadedBy: 'u1',
        thumbnailUrl: 'https://example.com/t.jpg',
        tags: ['家'],
        favoriteCount: 0,
        favoritedByMe: false,
      },
    });
    await photosService.update('p1', { caption: 'hello', tags: ['家'] });
    const req = mock.requests[0];
    expect(req?.method).toBe('PATCH');
    expect(req?.url).toMatch(/\/api\/photos\/p1$/);
    expect(req?.data).toEqual({ caption: 'hello', tags: ['家'] });
  });
});
