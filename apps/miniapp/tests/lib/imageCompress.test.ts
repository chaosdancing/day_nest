import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installWxMock, uninstallWxMock, type WxMock } from '../helpers/wxMock.js';
import { compressImage } from '../../miniprogram/lib/imageCompress.js';

describe('compressImage', () => {
  let mock: WxMock;
  beforeEach(() => {
    mock = installWxMock();
  });
  afterEach(() => uninstallWxMock());

  it('uses long-edge target when source is wider than tall', async () => {
    mock.queueImageInfo({ width: 4000, height: 3000 });
    mock.queueCompressResult({ tempFilePath: 'wxfile://compressed.jpg' });
    const out = await compressImage({ src: 'wxfile://src.jpg', longEdge: 1600, quality: 75 });
    expect(out.tempFilePath).toBe('wxfile://compressed.jpg');
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
  });

  it('uses long-edge target on the height when source is portrait', async () => {
    mock.queueImageInfo({ width: 3000, height: 4000 });
    mock.queueCompressResult({ tempFilePath: 'wxfile://compressed2.jpg' });
    const out = await compressImage({ src: 'wxfile://src.jpg' });
    expect(out.width).toBe(1200);
    expect(out.height).toBe(1600);
  });

  it('does not upscale: returns the source dimensions when smaller than long-edge', async () => {
    mock.queueImageInfo({ width: 800, height: 600 });
    mock.queueCompressResult({ tempFilePath: 'wxfile://compressed3.jpg' });
    const out = await compressImage({ src: 'wxfile://src.jpg' });
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });

  it('rejects when wx.compressImage fails', async () => {
    mock.queueImageInfo({ width: 1000, height: 1000 });
    await expect(compressImage({ src: 'wxfile://src.jpg' })).rejects.toBeDefined();
  });
});
