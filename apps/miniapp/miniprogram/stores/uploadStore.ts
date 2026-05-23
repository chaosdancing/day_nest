import { createStore } from '../lib/store.js';

export type PhotoStage =
  | { kind: 'queued' }
  | { kind: 'compressing' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'done'; fileKey: string; width: number; height: number; takenAt: string | null }
  | { kind: 'failed'; error: string };

export interface DraftPhoto {
  id: string;
  originalPath: string;
  thumbPath: string;
  width: number;
  height: number;
  size: number;
  stage: PhotoStage;
}

export interface UploadStoreState {
  photos: DraftPhoto[];
  title: string;
  description: string;
  location: string;
  tags: string[];
  occurredOn: string;
  draftId: string;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newDraftId(): string {
  // WeChat mini-program runtime does NOT expose a `crypto` global; only
  // `wx.getRandomValues` exists. Referencing `crypto` bare would throw
  // `ReferenceError` at module-load. Guard with `typeof` (the only existence
  // check that survives an undeclared identifier).
  if (typeof crypto !== 'undefined') {
    const maybe = (crypto as { randomUUID?: () => string }).randomUUID?.();
    if (typeof maybe === 'string') return maybe;
  }
  return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function initialState(): UploadStoreState {
  return {
    photos: [],
    title: '',
    description: '',
    location: '',
    tags: [],
    occurredOn: todayLocal(),
    draftId: newDraftId(),
  };
}

const store = createStore<UploadStoreState>(initialState());

export const uploadStore = {
  get: () => store.getState(),
  subscribe: store.subscribe.bind(store),

  reset() {
    store.setState(initialState());
  },

  addPhotos(items: Omit<DraftPhoto, 'stage'>[]) {
    const next: DraftPhoto[] = items.map((it) => ({ ...it, stage: { kind: 'queued' as const } }));
    const s = store.getState();
    store.setState({ ...s, photos: [...s.photos, ...next] });
  },

  removePhoto(id: string) {
    const s = store.getState();
    store.setState({ ...s, photos: s.photos.filter((p) => p.id !== id) });
  },

  setStage(id: string, stage: PhotoStage) {
    const s = store.getState();
    store.setState({
      ...s,
      photos: s.photos.map((p) => (p.id === id ? { ...p, stage } : p)),
    });
  },

  setMeta(patch: Partial<Pick<UploadStoreState, 'title' | 'description' | 'location' | 'tags' | 'occurredOn'>>) {
    const s = store.getState();
    store.setState({ ...s, ...patch });
  },

  overallProgress(): number {
    const s = store.getState();
    if (s.photos.length === 0) return 0;
    const done = s.photos.filter((p) => p.stage.kind === 'done').length;
    return done / s.photos.length;
  },
};
