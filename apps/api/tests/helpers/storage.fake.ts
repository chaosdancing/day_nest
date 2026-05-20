import type { StorageProvider, UploadTokenBundle } from '../../src/storage/provider.js';

export class FakeStorage implements StorageProvider {
  public uploaded: string[] = [];
  public deleted: string[] = [];

  async createUploadToken(key: string): Promise<UploadTokenBundle> {
    this.uploaded.push(key);
    return {
      token: `fake-token-${key}`,
      key,
      uploadUrl: 'https://fake-upload.daynest.test',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  }

  signDownload(key: string): string {
    return `https://daynest.fake.cdn/${key}?token=signed`;
  }

  signThumbnail(key: string, width: number): string {
    return `https://daynest.fake.cdn/${key}?imageMogr2/thumbnail/x${width}&token=signed`;
  }

  async deleteObject(key: string): Promise<void> {
    this.deleted.push(key);
  }
}
