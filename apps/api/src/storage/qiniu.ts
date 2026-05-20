import qiniu from 'qiniu';
import type { StorageProvider, UploadTokenBundle } from './provider.js';

const ZONE_MAP: Record<string, qiniu.conf.Zone> = {
  z0: qiniu.zone.Zone_z0,
  z1: qiniu.zone.Zone_z1,
  z2: qiniu.zone.Zone_z2,
  na0: qiniu.zone.Zone_na0,
  as0: qiniu.zone.Zone_as0,
};

const UPLOAD_HOSTS: Record<string, string> = {
  z0: 'https://upload.qiniup.com',
  z1: 'https://upload-z1.qiniup.com',
  z2: 'https://upload-z2.qiniup.com',
  na0: 'https://upload-na0.qiniup.com',
  as0: 'https://upload-as0.qiniup.com',
  'cn-east-2': 'https://upload-cn-east-2.qiniup.com',
};

export type QiniuStorageOpts = {
  accessKey: string;
  secretKey: string;
  bucket: string;
  domain: string;
  zone: string;
  uploadTtlSeconds?: number;
  downloadTtlSeconds?: number;
};

export class QiniuStorage implements StorageProvider {
  private mac: qiniu.auth.digest.Mac;

  constructor(private opts: QiniuStorageOpts) {
    this.mac = new qiniu.auth.digest.Mac(opts.accessKey, opts.secretKey);
  }

  async createUploadToken(key: string): Promise<UploadTokenBundle> {
    const ttl = this.opts.uploadTtlSeconds ?? 3600;
    const policy = new qiniu.rs.PutPolicy({
      scope: `${this.opts.bucket}:${key}`,
      expires: ttl,
      returnBody: JSON.stringify({
        key: '$(key)',
        hash: '$(etag)',
        size: '$(fsize)',
        width: '$(imageInfo.width)',
        height: '$(imageInfo.height)',
      }),
    });
    const token = policy.uploadToken(this.mac);
    return {
      token,
      key,
      uploadUrl: UPLOAD_HOSTS[this.opts.zone] ?? UPLOAD_HOSTS.z0!,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  signDownload(key: string, ttlSeconds?: number): string {
    const ttl = ttlSeconds ?? this.opts.downloadTtlSeconds ?? 3600;
    const baseUrl = `${this.opts.domain}/${key}`;
    return this.signed(baseUrl, ttl);
  }

  signThumbnail(key: string, widthPx: number): string {
    const ttl = this.opts.downloadTtlSeconds ?? 3600;
    const baseUrl = `${this.opts.domain}/${key}?imageMogr2/thumbnail/x${widthPx}/format/webp/interlace/1`;
    return this.signed(baseUrl, ttl);
  }

  async deleteObject(key: string): Promise<void> {
    const cfg = new qiniu.conf.Config({
      zone: ZONE_MAP[this.opts.zone] ?? qiniu.zone.Zone_z0,
    });
    const bucketManager = new qiniu.rs.BucketManager(this.mac, cfg);
    await new Promise<void>((resolveFn, reject) => {
      bucketManager.delete(this.opts.bucket, key, (err) => {
        if (err) reject(err);
        else resolveFn();
      });
    });
  }

  private signed(url: string, ttlSeconds: number): string {
    const deadline = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sep = url.includes('?') ? '&' : '?';
    const toSign = `${url}${sep}e=${deadline}`;
    const sign = qiniu.util.hmacSha1(toSign, this.opts.secretKey);
    const encodedSign = qiniu.util.base64ToUrlSafe(sign);
    return `${toSign}&token=${this.opts.accessKey}:${encodedSign}`;
  }
}
