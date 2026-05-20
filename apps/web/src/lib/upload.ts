import imageCompression from 'browser-image-compression';
import exifr from 'exifr';
import { api } from './api';
import type { UploadTokenBundle } from './uploadTypes';

export type LocalPhoto = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  takenAt: string | null;
  caption: string | null;
  tags: string[];
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  progress: number;
  fileKey?: string;
  error?: string;
};

export async function loadLocalPhoto(file: File): Promise<LocalPhoto> {
  const compress = file.size > 4 * 1024 * 1024;
  const finalFile = compress
    ? await imageCompression(file, {
        maxSizeMB: 4,
        maxWidthOrHeight: 4096,
        useWebWorker: true,
        initialQuality: 0.9,
      })
    : file;

  const previewUrl = URL.createObjectURL(finalFile);
  const [{ width, height }, exif] = await Promise.all([
    readImageDimensions(previewUrl),
    exifr.parse(finalFile).catch(() => null as null | { DateTimeOriginal?: Date }),
  ]);

  return {
    file: finalFile,
    previewUrl,
    width,
    height,
    takenAt: exif?.DateTimeOriginal
      ? new Date(exif.DateTimeOriginal).toISOString()
      : null,
    caption: null,
    tags: [],
    status: 'pending',
    progress: 0,
  };
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

export async function requestUploadTokens(params: {
  count: number;
  ext: string;
  collectionDraftId?: string;
}): Promise<UploadTokenBundle[]> {
  const res = await api.post<{ tokens: UploadTokenBundle[] }>(
    '/uploads/token',
    params
  );
  return res.data.tokens;
}

export function uploadToQiniu(
  bundle: UploadTokenBundle,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ key: string; hash: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('key', bundle.key);
    form.append('token', bundle.token);
    form.append('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', bundle.uploadUrl, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ key: bundle.key, hash: '' });
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}
