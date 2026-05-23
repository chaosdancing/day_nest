import { describe, it, expect, beforeEach } from 'vitest';
import { uploadStore } from '../../miniprogram/stores/uploadStore.js';

describe('uploadStore', () => {
  beforeEach(() => uploadStore.reset());

  it('starts empty with today\'s date', () => {
    const s = uploadStore.get();
    expect(s.photos).toEqual([]);
    expect(s.title).toBe('');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(s.occurredOn)).toBe(true);
  });

  it('addPhotos appends new entries with stage=queued', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a.jpg', thumbPath: 'a.jpg', width: 100, height: 100, size: 1000 },
    ]);
    expect(uploadStore.get().photos.length).toBe(1);
    expect(uploadStore.get().photos[0]?.stage).toEqual({ kind: 'queued' });
  });

  it('removePhoto drops the matching entry by id', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a.jpg', thumbPath: 'a.jpg', width: 1, height: 1, size: 1 },
      { id: 'p2', originalPath: 'b.jpg', thumbPath: 'b.jpg', width: 1, height: 1, size: 1 },
    ]);
    uploadStore.removePhoto('p1');
    expect(uploadStore.get().photos.map((p) => p.id)).toEqual(['p2']);
  });

  it('setStage updates the stage on the matching photo immutably', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a.jpg', thumbPath: 'a.jpg', width: 1, height: 1, size: 1 },
    ]);
    const before = uploadStore.get().photos[0];
    uploadStore.setStage('p1', { kind: 'uploading', percent: 40 });
    const after = uploadStore.get().photos[0];
    expect(after?.stage).toEqual({ kind: 'uploading', percent: 40 });
    // Immutability: array element should be a new object
    expect(after).not.toBe(before);
  });

  it('setMeta merges metadata fields', () => {
    uploadStore.setMeta({ title: 'Hello', location: 'Earth' });
    expect(uploadStore.get().title).toBe('Hello');
    expect(uploadStore.get().location).toBe('Earth');
  });

  it('overallProgress returns the fraction of photos done', () => {
    uploadStore.addPhotos([
      { id: 'p1', originalPath: 'a', thumbPath: 'a', width: 1, height: 1, size: 1 },
      { id: 'p2', originalPath: 'b', thumbPath: 'b', width: 1, height: 1, size: 1 },
    ]);
    uploadStore.setStage('p1', { kind: 'done', fileKey: 'k1', width: 1, height: 1, takenAt: null });
    expect(uploadStore.overallProgress()).toBe(0.5);
  });

  it('reset clears state and generates a fresh draftId', () => {
    const a = uploadStore.get().draftId;
    uploadStore.addPhotos([{ id: 'p', originalPath: 'a', thumbPath: 'a', width: 1, height: 1, size: 1 }]);
    uploadStore.reset();
    expect(uploadStore.get().photos).toEqual([]);
    expect(uploadStore.get().draftId).not.toBe(a);
  });
});
