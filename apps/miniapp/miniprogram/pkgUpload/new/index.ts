import type { CollectionCreateInput, CollectionAppendInput, TagDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { tagsService } from '../../lib/services/tags.js';
import { uploadsService } from '../../lib/services/uploads.js';
import { uploadStore, type DraftPhoto } from '../../stores/uploadStore.js';
import { compressImage } from '../../lib/imageCompress.js';
import { readExifFromPath } from '../../lib/exif.js';
import { createUploadQueue } from '../../lib/uploadQueue.js';
import { debounce, type DebouncedFn } from '../../lib/debounce.js';
import { stableAngle } from '../../lib/hash.js';
import { applyTheme, disposeTheme } from '../../lib/theme.js';
import { enableShareMenu } from '../../lib/shareMenu.js';

let unsubscribe: (() => void) | null = null;
let titleSearch: DebouncedFn<[string]> | null = null;

const QUEUE_CONCURRENCY = 10;
// Long-edge cap + JPEG quality for the client-side compression before upload.
// Bumped from 1600/75 so stored originals stay sharp when zoomed in the viewer.
const COMPRESS_LONG_EDGE = 2560;
const COMPRESS_QUALITY = 82;

type DraftPhotoView = DraftPhoto & {
  frameStyle: string;
  tiltDeg: number;
};

function photoFrameStyle(photo: DraftPhoto): string {
  if (!photo.width || !photo.height) return '';
  const raw = (photo.height / photo.width) * 100;
  const clamped = Math.max(50, Math.min(160, raw));
  return `padding-top: ${Number(clamped.toFixed(2))}%`;
}

function toPhotoView(photo: DraftPhoto, index: number): DraftPhotoView {
  const sign = index % 2 === 0 ? -1 : 1;
  return {
    ...photo,
    frameStyle: photoFrameStyle(photo),
    tiltDeg: stableAngle(`upload-${photo.id}`, 2) + sign * 2,
  };
}

function estimateCardHeight(photo: DraftPhotoView): number {
  const raw = photo.width && photo.height ? (photo.height / photo.width) * 100 : 75;
  return Math.max(50, Math.min(160, raw)) + 30;
}

function splitColumns(photos: DraftPhotoView[]): { left: DraftPhotoView[]; right: DraftPhotoView[] } {
  const left: DraftPhotoView[] = [];
  const right: DraftPhotoView[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  for (const photo of photos) {
    const h = estimateCardHeight(photo);
    if (leftHeight <= rightHeight) {
      left.push(photo);
      leftHeight += h;
    } else {
      right.push(photo);
      rightHeight += h;
    }
  }
  return { left, right };
}

interface PageData {
  theme: '' | 'dark';
  photos: DraftPhoto[];
  leftPhotos: DraftPhotoView[];
  rightPhotos: DraftPhotoView[];
  title: string;
  description: string;
  location: string;
  tags: string[];
  occurredOn: string;
  tagSuggestions: string[];
  // All distinct existing locations (the pool) + the fuzzy-matched subset for
  // the current location input.
  locationPool: string[];
  locationMatches: string[];
  mergeCandidateId: string;
  mergeCandidateTitle: string;
  mergeIntoId: string;
  uploading: boolean;
  canSubmit: boolean;
  progressPercent: number;
  progressLabel: string;
}

Page({
  data: {
    theme: '',
    photos: [],
    leftPhotos: [],
    rightPhotos: [],
    title: '',
    description: '',
    location: '',
    tags: [],
    occurredOn: '',
    tagSuggestions: [],
    locationPool: [],
    locationMatches: [],
    mergeCandidateId: '',
    mergeCandidateTitle: '',
    mergeIntoId: '',
    uploading: false,
    canSubmit: false,
    progressPercent: 0,
    progressLabel: '',
  } as PageData,

  onLoad() {
    applyTheme(this);
    enableShareMenu();
    compressedPaths.clear();
    uploadStore.reset();
    this.syncFromStore();
    unsubscribe = uploadStore.subscribe(() => this.syncFromStore());
    titleSearch = debounce<[string]>(this.lookupTitle.bind(this), 400);
    void this.loadTagSuggestions();
    void this.loadLocationSuggestions();
  },

  onUnload() {
    disposeTheme(this);
    compressedPaths.clear();
    unsubscribe?.();
    unsubscribe = null;
    titleSearch?.cancel();
    titleSearch = null;
  },

  syncFromStore() {
    const s = uploadStore.get();
    const canSubmit = s.photos.length > 0 && s.title.trim().length > 0 && !this.data.uploading;
    const done = s.photos.filter((p) => p.stage.kind === 'done').length;
    const total = s.photos.length;
    const columns = splitColumns(s.photos.map((photo, index) => toPhotoView(photo, index)));
    this.setData({
      photos: s.photos,
      leftPhotos: columns.left,
      rightPhotos: columns.right,
      title: s.title,
      description: s.description,
      location: s.location,
      tags: s.tags,
      occurredOn: s.occurredOn,
      canSubmit,
      progressPercent: total > 0 ? Math.round((done / total) * 100) : 0,
      progressLabel: total > 0 ? `${done} / ${total}` : '',
    });
  },

  async loadTagSuggestions() {
    try {
      const tags = await tagsService.list();
      this.setData({ tagSuggestions: tags.map((t: TagDTO) => t.displayName) });
    } catch {
      // Suggestions are a polish — silently fall back to none.
    }
  },

  async loadLocationSuggestions() {
    try {
      const rows = await collectionsService.locations();
      this.setData({ locationPool: rows.map((r) => r.location) });
      // Re-derive matches in case the user already typed before this resolved.
      this.refreshLocationMatches(this.data.location);
    } catch {
      // Suggestions are a polish — silently fall back to none.
    }
  },

  /**
   * Fuzzy-match the typed location against existing ones: case-insensitive
   * substring match, the exact-equal value excluded (nothing to suggest), most
   * frequent first (the pool is already frequency-ordered). Capped to 6.
   */
  refreshLocationMatches(value: string) {
    const q = value.trim().toLowerCase();
    if (!q) {
      if (this.data.locationMatches.length) this.setData({ locationMatches: [] });
      return;
    }
    const matches = this.data.locationPool
      .filter((loc) => {
        const l = loc.toLowerCase();
        return l !== q && l.includes(q);
      })
      .slice(0, 6);
    this.setData({ locationMatches: matches });
  },

  onLocationPick(e: WechatMiniprogram.TouchEvent) {
    const loc = e.currentTarget.dataset.loc as string;
    if (!loc) return;
    uploadStore.setMeta({ location: loc });
    this.setData({ locationMatches: [] });
  },

  async onPickMore() {
    if (this.data.uploading) return;
    const remaining = Math.max(0, 50 - this.data.photos.length);
    if (remaining === 0) {
      wx.showToast({ title: '最多 50 张', icon: 'none' });
      return;
    }
    try {
      const res = await new Promise<{ tempFiles: Array<{ tempFilePath: string; size: number; width?: number; height?: number }> }>((resolveOk, reject) => {
        wx.chooseMedia({
          count: Math.min(9, remaining),
          mediaType: ['image'],
          sizeType: ['original'],
          sourceType: ['album', 'camera'],
          success: resolveOk,
          fail: reject,
        });
      });
      const items = res.tempFiles.map((f) => ({
        id: 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        originalPath: f.tempFilePath,
        thumbPath: f.tempFilePath,
        width: f.width ?? 0,
        height: f.height ?? 0,
        size: f.size,
      }));
      // Capture emptiness BEFORE the store mutation: addPhotos runs its
      // subscribers synchronously (syncFromStore → setData), and setData
      // updates `this.data` synchronously — so reading
      // `this.data.photos.length` after addPhotos always sees the new items.
      const wasEmpty = this.data.photos.length === 0;
      uploadStore.addPhotos(items);
      if (wasEmpty && items[0]) {
        void this.tryDefaultDateFrom(items[0].originalPath);
      }
    } catch {
      // User cancelled — no toast.
    }
  },

  async tryDefaultDateFrom(path: string) {
    try {
      const exif = await readExifFromPath(path);
      if (exif.dateTimeOriginal) {
        const ymd = exif.dateTimeOriginal.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          uploadStore.setMeta({ occurredOn: ymd });
        }
      }
    } catch {
      // best-effort
    }
  },

  onRemovePhoto(e: WechatMiniprogram.TouchEvent) {
    if (this.data.uploading) return;
    const id = e.currentTarget.dataset.id as string;
    compressedPaths.delete(id);
    uploadStore.removePhoto(id);
  },

  onTitleInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value;
    uploadStore.setMeta({ title: v });
    titleSearch?.run(v);
  },

  async lookupTitle(title: string) {
    const t = title.trim();
    if (!t) {
      this.setData({ mergeCandidateId: '', mergeCandidateTitle: '', mergeIntoId: '' });
      return;
    }
    try {
      const res = await collectionsService.byTitle(t);
      if (res.collection) {
        this.setData({
          mergeCandidateId: res.collection.id,
          mergeCandidateTitle: res.collection.title,
        });
      } else {
        this.setData({ mergeCandidateId: '', mergeCandidateTitle: '', mergeIntoId: '' });
      }
    } catch {
      // Best-effort.
    }
  },

  onMergeToggle(e: WechatMiniprogram.SwitchChange) {
    this.setData({ mergeIntoId: e.detail.value ? this.data.mergeCandidateId : '' });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    uploadStore.setMeta({ occurredOn: e.detail.value as string });
  },

  onLocationInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value;
    uploadStore.setMeta({ location: v });
    this.refreshLocationMatches(v);
  },

  onDescriptionInput(e: WechatMiniprogram.Input) {
    uploadStore.setMeta({ description: e.detail.value });
  },

  onTagsChange(e: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    uploadStore.setMeta({ tags: e.detail.value });
  },

  async onSubmit() {
    const s = uploadStore.get();
    if (s.photos.length === 0 || s.title.trim().length === 0 || this.data.uploading) return;
    this.setData({ uploading: true });
    try {
      // 1) Compress each photo serially (parallel decoders thrash mobile)
      for (const p of s.photos) {
        if (p.stage.kind === 'done') continue;
        uploadStore.setStage(p.id, { kind: 'compressing' });
        try {
          const c = await compressImage({
            src: p.originalPath,
            longEdge: COMPRESS_LONG_EDGE,
            quality: COMPRESS_QUALITY,
          });
          // Replace path/dimensions in-place by re-adding with the compressed temp file.
          // We track new dims on the photo via setStage with a temporary uploading-0% marker;
          // the final fileKey/width/height come from Qiniu's returnBody.
          uploadStore.setStage(p.id, { kind: 'uploading', percent: 0 });
          // store compressed path on a side map
          compressedPaths.set(p.id, { path: c.tempFilePath, w: c.width, h: c.height });
        } catch (err) {
          uploadStore.setStage(p.id, { kind: 'failed', error: String(err) });
        }
      }
      // 2) Request a batch of tokens
      const toUpload = uploadStore.get().photos.filter((p) => p.stage.kind === 'uploading');
      if (toUpload.length === 0) throw new Error('no photos to upload');
      const tokens = await uploadsService.requestTokens({
        ext: 'jpg',
        count: toUpload.length,
        collectionDraftId: s.draftId,
      });
      if (tokens.length < toUpload.length) throw new Error('token shortfall');
      // 3) Pair and run uploads through the bounded queue
      const queue = createUploadQueue({ concurrency: QUEUE_CONCURRENCY });
      const exifByPhoto = new Map<string, string | null>();
      // EXIF pre-read for takenAt (best-effort, in parallel with uploads)
      const photoExifPromises = toUpload.map(async (p) => {
        const ex = await readExifFromPath(p.originalPath);
        exifByPhoto.set(p.id, ex.dateTimeOriginal ?? null);
      });
      const uploads = toUpload.map((p, idx) => queue.enqueue(async () => {
        const token = tokens[idx]!;
        const compressed = compressedPaths.get(p.id);
        if (!compressed) throw new Error('compressed path missing for ' + p.id);
        try {
          const ret = await uploadsService.uploadToQiniu({
            token: token.token,
            key: token.key,
            uploadUrl: token.uploadUrl,
            filePath: compressed.path,
          });
          // takenAt is best-effort: whatever the parallel EXIF read has landed
          // into `exifByPhoto` by the time the upload returns is good enough.
          // The previous Promise.race-against-Promise.resolve idiom was dead
          // code (the already-resolved branch always won), so we drop it.
          uploadStore.setStage(p.id, {
            kind: 'done',
            fileKey: ret.key,
            width: ret.width || compressed.w,
            height: ret.height || compressed.h,
            takenAt: exifByPhoto.get(p.id) ?? null,
          });
        } catch (err) {
          uploadStore.setStage(p.id, { kind: 'failed', error: String(err) });
          throw err;
        }
      }));
      await Promise.allSettled([Promise.all(photoExifPromises), ...uploads]);
      // 4) Commit
      const finalState = uploadStore.get();
      const succeeded = finalState.photos.filter((p) => p.stage.kind === 'done');
      if (succeeded.length === 0) throw new Error('all uploads failed');
      const photoInputs = succeeded.map((p) => {
        const done = p.stage as Extract<typeof p.stage, { kind: 'done' }>;
        return {
          fileKey: done.fileKey,
          width: done.width,
          height: done.height,
          caption: null,
          takenAt: done.takenAt,
          tags: [],
        };
      });
      if (this.data.mergeIntoId) {
        const body: CollectionAppendInput = { photos: photoInputs, extraTags: finalState.tags };
        await collectionsService.append(this.data.mergeIntoId, body);
        wx.showToast({ title: '已加入', icon: 'success' });
      } else {
        const body: CollectionCreateInput = {
          title: finalState.title.trim(),
          description: finalState.description.trim() || null,
          occurredOn: finalState.occurredOn,
          occurredUntil: null,
          location: finalState.location.trim() || null,
          tags: finalState.tags,
          photos: photoInputs,
        };
        await collectionsService.create(body);
        wx.showToast({ title: '创建成功', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 700);
    } catch (err) {
      // Reset any photos still mid-pipeline so the cell overlay reflects the
      // failure (otherwise "上传 0%" / "压缩中…" stays stuck) AND so that the
      // subscriber-driven syncFromStore re-runs to recompute `canSubmit` with
      // `uploading=false`, letting the user retry.
      const cur = uploadStore.get();
      for (const photo of cur.photos) {
        if (photo.stage.kind === 'uploading' || photo.stage.kind === 'compressing') {
          uploadStore.setStage(photo.id, { kind: 'failed', error: String(err) });
        }
      }
      wx.showToast({ title: '上传失败', icon: 'none' });
      this.setData({ uploading: false });
      this.syncFromStore();
      console.error('upload submit', err);
    }
  },

  onShareTimeline() {
    return {
      title: '慢慢记 · 新建回忆',
      query: '',
    };
  },
});

// Module-scoped: maps photo id → compressed temp path + dimensions. Kept
// outside Page() data because compressed paths are runtime-only and don't
// need to round-trip through setData (they're not bound in WXML).
const compressedPaths = new Map<string, { path: string; w: number; h: number }>();
