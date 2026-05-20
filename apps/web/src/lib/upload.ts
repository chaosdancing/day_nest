import imageCompression from 'browser-image-compression';
import exifr from 'exifr';
import { api } from './api';
import { pickExifTakenAt, type ExifDateFields } from './photoMetadata';
import type { UploadTokenBundle } from './uploadTypes';

/**
 * Run `worker` over each item with up to `concurrency` in flight at once.
 * Returns results in the same order as inputs. Throws on first error
 * (after letting in-flight tasks complete).
 */
export async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let firstError: unknown = null;
  const runOne = async () => {
    while (cursor < items.length && firstError === null) {
      const i = cursor++;
      try {
        results[i] = await worker(items[i] as T, i);
      } catch (e) {
        if (firstError === null) firstError = e;
      }
    }
  };
  const lanes = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: lanes }, runOne));
  if (firstError) throw firstError;
  return results;
}

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
  const [finalFile, exif] = await Promise.all([
    compress
      ? imageCompression(file, {
          maxSizeMB: 4,
          maxWidthOrHeight: 4096,
          useWebWorker: true,
          initialQuality: 0.9,
        })
      : Promise.resolve(file),
    // Read metadata from the original file before compression strips EXIF.
    exifr.parse(file).catch(() => null as null | ExifDateFields),
  ]);

  const previewUrl = URL.createObjectURL(finalFile);
  const { width, height } = await readImageDimensions(previewUrl);

  return {
    file: finalFile,
    previewUrl,
    width,
    height,
    takenAt: pickExifTakenAt(exif),
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
