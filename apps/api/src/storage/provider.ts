export type UploadTokenBundle = {
  token: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
};

export interface StorageProvider {
  createUploadToken(key: string): Promise<UploadTokenBundle>;
  signDownload(key: string, ttlSeconds?: number): string;
  signThumbnail(key: string, widthPx: number): string;
  deleteObject(key: string): Promise<void>;
}
