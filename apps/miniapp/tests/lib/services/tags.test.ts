import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { tagsService } from '../../../miniprogram/lib/services/tags.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('tagsService', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('list() returns the array directly', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: [
        { id: 't1', name: 'travel', displayName: '旅行', photoCount: 12, collectionCount: 3 },
        { id: 't2', name: 'birthday', displayName: '生日', photoCount: 6, collectionCount: 2 },
      ],
    });
    const tags = await tagsService.list();
    expect(tags.length).toBe(2);
    expect(tags[0]?.displayName).toBe('旅行');
    expect(mock.requests[0]?.url).toMatch(/\/api\/tags$/);
  });
});
