import { describe, it, expect } from 'vitest';
import { FakeStorage } from './helpers/storage.fake.js';

describe('StorageProvider contract', () => {
  it('returns upload bundle with token + key', async () => {
    const s = new FakeStorage();
    const b = await s.createUploadToken('photos/c1/p1.jpg');
    expect(b.token).toMatch(/fake-token/);
    expect(b.key).toBe('photos/c1/p1.jpg');
    expect(s.uploaded).toContain('photos/c1/p1.jpg');
  });

  it('signs thumbnail URL with width param', () => {
    const url = new FakeStorage().signThumbnail('photos/x.jpg', 800);
    expect(url).toContain('thumbnail/x800');
  });

  it('records deleted keys', async () => {
    const s = new FakeStorage();
    await s.deleteObject('photos/y.jpg');
    expect(s.deleted).toContain('photos/y.jpg');
  });
});
