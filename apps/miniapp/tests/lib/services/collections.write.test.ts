import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../../helpers/wxMock.js';
import { collectionsService } from '../../../miniprogram/lib/services/collections.js';
import { authStore } from '../../../miniprogram/stores/authStore.js';

describe('collectionsService.create', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('POSTs to /api/collections with the full body', async () => {
    mock.queueResponse({ statusCode: 201, data: { id: 'c1', title: 'Trip', photos: [], previewPhotos: [], tags: [], photoCount: 0 } });
    const res = await collectionsService.create({
      title: 'Trip',
      description: null,
      occurredOn: '2026-05-01',
      occurredUntil: null,
      location: null,
      tags: [],
      photos: [{ fileKey: 'k1', width: 1600, height: 1200, caption: null, takenAt: null, tags: [] }],
    });
    expect(res.id).toBe('c1');
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/collections$/);
    expect((req?.data as { title: string }).title).toBe('Trip');
  });
});

describe('collectionsService.append', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('POSTs to /api/collections/<id>/append', async () => {
    mock.queueResponse({ statusCode: 200, data: { id: 'c-existing', title: 'X', photos: [] } });
    await collectionsService.append('c-existing', {
      photos: [{ fileKey: 'k2', width: 800, height: 600, caption: null, takenAt: null, tags: [] }],
      extraTags: ['新增'],
    });
    const req = mock.requests[0];
    expect(req?.method).toBe('POST');
    expect(req?.url).toMatch(/\/api\/collections\/c-existing\/append$/);
    expect((req?.data as { extraTags: string[] }).extraTags).toEqual(['新增']);
  });
});

describe('collectionsService.byTitle', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
    authStore.reset();
    authStore.setTokens('a1', 'r1');
  });
  afterEach(() => uninstallWxMock());

  it('GETs /api/collections/by-title with the title query', async () => {
    mock.queueResponse({
      statusCode: 200,
      data: { collection: null, directTags: [], matches: [] },
    });
    const res = await collectionsService.byTitle('summer');
    expect(res.collection).toBeNull();
    expect(res.matches).toEqual([]);
    expect(mock.requests[0]?.url).toMatch(/\/api\/collections\/by-title\?title=summer$/);
  });

  it('URL-encodes CJK titles', async () => {
    mock.queueResponse({ statusCode: 200, data: { collection: null, directTags: [], matches: [] } });
    await collectionsService.byTitle('夏日');
    expect(mock.requests[0]?.url).toMatch(/\/api\/collections\/by-title\?title=%E5%A4%8F%E6%97%A5$/);
  });
});
