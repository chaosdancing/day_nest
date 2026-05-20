import {
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateInputValue } from '@/lib/photoMetadata';
import {
  loadLocalPhoto,
  pool,
  requestUploadTokens,
  uploadToQiniu,
  type LocalPhoto,
} from '@/lib/upload';
import { Polaroid } from '@/components/scrapbook/Polaroid';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { TagPicker } from '@/components/scrapbook/TagPicker';
import {
  UploadProgress,
  type UploadPhase,
} from '@/components/scrapbook/UploadProgress';
import { AnimatePresence } from 'framer-motion';
import { useTags } from '@/hooks/useTags';
import { useCollectionByTitle } from '@/hooks/useCollections';
import type { CollectionDetailDTO } from '@daynest/shared';

const MAX_PHOTOS = 50;
const UPLOAD_CONCURRENCY = 6;

type DraftMeta = {
  title: string;
  description: string;
  occurredOn: string;
  location: string;
  tags: string[];
};

const DEFAULT_OCCURRED_ON = new Date().toISOString().slice(0, 10);

const emptyMeta = (): DraftMeta => ({
  title: '',
  description: '',
  occurredOn: DEFAULT_OCCURRED_ON,
  location: '',
  tags: [],
});

export function UploadPage() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [meta, setMeta] = useState<DraftMeta>(emptyMeta);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<'select' | 'meta'>('select');
  const [uploadPhase, setUploadPhase] = useState<UploadPhase | null>(null);

  const tagsQuery = useTags();
  const allTagNames = useMemo(
    () => (tagsQuery.data ?? []).map((t) => t.name),
    [tagsQuery.data]
  );

  const matchQuery = useCollectionByTitle(meta.title);
  const titleMatches = matchQuery.data?.matches ?? [];
  const [selectedMergeId, setSelectedMergeId] = useState<string | null>(null);
  const selectedMerge = titleMatches.find(
    (m) => m.collection.id === selectedMergeId
  );
  const matchedCollection = selectedMerge?.collection ?? null;
  const mergingDirectTags = useMemo(
    () => selectedMerge?.directTags ?? [],
    [selectedMerge]
  );

  const mergingTagNames = mergingDirectTags;

  // Reflect merging tags into meta.tags (additive, no duplicates)
  const effectiveCollectionTags = useMemo(() => {
    if (!matchedCollection) return meta.tags;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...mergingTagNames, ...meta.tags]) {
      const key = t.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }, [matchedCollection, mergingTagNames, meta.tags]);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (photos.length + list.length > MAX_PHOTOS) {
      alert(`一次最多上传 ${MAX_PHOTOS} 张`);
      return;
    }
    const loaded = await Promise.all(list.map((f) => loadLocalPhoto(f)));
    setPhotos((p) => {
      const next = [...p, ...loaded];
      if (p.length === 0 && meta.occurredOn === DEFAULT_OCCURRED_ON) {
        const firstTakenAt = next.find((x) => x.takenAt)?.takenAt;
        const inputDate = formatDateInputValue(firstTakenAt);
        if (inputDate) {
          setMeta((m) => ({
            ...m,
            occurredOn: inputDate,
          }));
        }
      }
      return next;
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
  };

  const submit = useMutation({
    mutationFn: async () => {
      setUploadPhase('uploading');
      // Reset any prior failed/uploaded state on retries
      setPhotos((cur) =>
        cur.map((x) =>
          x.status === 'uploaded'
            ? x
            : { ...x, status: 'pending', progress: 0, error: undefined }
        )
      );

      const pending = photos
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.status !== 'uploaded' || !p.fileKey);

      const tokens =
        pending.length > 0
          ? await requestUploadTokens({
              count: pending.length,
              ext: photos[0]?.file.name.split('.').pop()?.toLowerCase() ?? 'jpg',
            })
          : [];

      await pool(pending, UPLOAD_CONCURRENCY, async ({ p, i }, tokenIdx) => {
        const token = tokens[tokenIdx]!;
        setPhotos((cur) =>
          cur.map((x, j) =>
            j === i ? { ...x, status: 'uploading', progress: 0 } : x
          )
        );
        try {
          const { key } = await uploadToQiniu(token, p.file, (pct) =>
            setPhotos((cur) =>
              cur.map((x, j) => (j === i ? { ...x, progress: pct } : x))
            )
          );
          setPhotos((cur) =>
            cur.map((x, j) =>
              j === i
                ? { ...x, status: 'uploaded', fileKey: key, progress: 100 }
                : x
            )
          );
        } catch (err) {
          setPhotos((cur) =>
            cur.map((x, j) =>
              j === i
                ? { ...x, status: 'failed', error: (err as Error).message }
                : x
            )
          );
          throw err;
        }
      });

      setUploadPhase('saving');

      // After all uploads succeed, collect the resulting keys (in original order)
      // by re-reading state via a functional updater so we don't capture stale closure.
      const uploadedSnapshot = await new Promise<LocalPhoto[]>((resolve) => {
        setPhotos((cur) => {
          resolve(cur);
          return cur;
        });
      });

      const inheritedTags = matchedCollection
        ? Array.from(new Set([...mergingTagNames, ...meta.tags]))
        : meta.tags;
      const photoPayloads = uploadedSnapshot.map((p) => ({
        fileKey: p.fileKey!,
        width: p.width,
        height: p.height,
        caption: null as string | null,
        takenAt: p.takenAt,
        tags: p.tags.length > 0 ? p.tags : inheritedTags,
      }));

      if (matchedCollection) {
        const newTags = meta.tags.filter(
          (t) =>
            !mergingTagNames.some(
              (m) => m.toLocaleLowerCase() === t.trim().toLocaleLowerCase()
            )
        );
        const res = await api.post<CollectionDetailDTO>(
          `/collections/${matchedCollection.id}/append`,
          { photos: photoPayloads, extraTags: newTags }
        );
        return res.data;
      }

      const res = await api.post<CollectionDetailDTO>('/collections', {
        title: meta.title.trim(),
        description: meta.description.trim() || null,
        occurredOn: meta.occurredOn,
        occurredUntil: null,
        location: meta.location.trim() || null,
        tags: meta.tags,
        photos: photoPayloads,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setUploadPhase('done');
      // Brief delay so the user catches the "done" tick before we navigate.
      setTimeout(() => navigate(`/c/${data.id}`), 450);
    },
    onError: () => {
      setUploadPhase('failed');
    },
  });

  if (stage === 'select') {
    return (
      <div className="pb-16">
        <div className="text-center pb-6">
          <HandwrittenText as="h1" className="text-5xl block">
            上传一段回忆
          </HandwrittenText>
          <p className="font-mono text-xs tracking-widest text-ink/50 mt-2">
            STEP 1 · 选照片
          </p>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={
            'block border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ' +
            (dragOver ? 'border-kraft bg-kraft/10' : 'border-kraft/40 hover:border-kraft hover:bg-kraft/5')
          }
        >
          <p className="font-hand text-2xl text-kraft-dark mb-2">
            把照片拖进来 / 点击选择
          </p>
          <p className="text-sm text-ink/60">单次最多 {MAX_PHOTOS} 张 · JPG/PNG/HEIC</p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </label>

        {photos.length > 0 ? (
          <>
            <div
              className="grid gap-y-8 gap-x-4 mt-10"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
            >
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <Polaroid
                    src={p.previewUrl}
                    tiltSeed={`upl-${i}`}
                    aspectRatio={p.width / p.height}
                  />
                  <button
                    onClick={() =>
                      setPhotos((c) => c.filter((_, j) => j !== i))
                    }
                    className="absolute -top-2 -right-2 bg-pin-red text-paper rounded-full w-6 h-6 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-center mt-10">
              <button
                onClick={() => setStage('meta')}
                className="bg-kraft text-paper px-6 py-2.5 rounded-sm font-medium hover:bg-kraft-dark"
              >
                下一步 · 填资料
              </button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pb-16 max-w-2xl mx-auto">
      <div className="text-center pb-4">
        <p className="font-mono text-xs tracking-widest text-ink/50 mb-1">
          STEP 2 · 填资料
        </p>
        <HandwrittenText as="h1" className="text-4xl block">
          这次回忆叫什么
        </HandwrittenText>
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!meta.title.trim()) return;
          submit.mutate();
        }}
        className="space-y-6"
      >
        {/* Title + Date row */}
        <div className="relative">
          <label className="block">
            <input
              value={meta.title}
              onChange={(e) => {
                setSelectedMergeId(null);
                setMeta({ ...meta, title: e.target.value });
              }}
              required
              placeholder="给这次回忆起个名字…"
              className="w-full bg-transparent border-b-2 border-kraft/40 focus:border-kraft outline-none font-hand text-3xl text-ink/90 placeholder:text-ink/30 placeholder:font-hand py-2"
              autoFocus
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-kraft/10 border border-kraft/30">
              <span className="text-ink/50 font-mono text-[10px] uppercase tracking-widest">
                日期
              </span>
              <input
                type="date"
                value={meta.occurredOn}
                onChange={(e) => setMeta({ ...meta, occurredOn: e.target.value })}
                className="bg-transparent outline-none font-mono text-sm text-ink/80"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-kraft/10 border border-kraft/30 flex-1 min-w-[12rem]">
              <span className="text-ink/50 font-mono text-[10px] uppercase tracking-widest">
                地点
              </span>
              <input
                value={meta.location}
                onChange={(e) => setMeta({ ...meta, location: e.target.value })}
                placeholder="选填"
                className="bg-transparent outline-none font-hand text-base flex-1 placeholder:text-ink/30"
              />
            </div>
          </div>
        </div>

        {titleMatches.length > 0 ? (
          <MergeChooser
            matches={titleMatches}
            selectedId={selectedMergeId}
            onSelect={setSelectedMergeId}
          />
        ) : null}

        {/* Tags */}
        <section>
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-2">
            集合标签
            {matchedCollection ? (
              <span className="ml-2 text-pin-red/80 normal-case tracking-normal font-hand text-xs">
                · 已锁定的来自合并集合
              </span>
            ) : null}
          </h3>
          <TagPicker
            value={effectiveCollectionTags}
            onChange={(next) => {
              const lockedSet = new Set(
                mergingTagNames.map((t) => t.toLocaleLowerCase())
              );
              const writable = next.filter(
                (t) => !lockedSet.has(t.trim().toLocaleLowerCase())
              );
              setMeta({ ...meta, tags: writable });
            }}
            lockedTags={mergingTagNames}
            suggestions={allTagNames}
            placeholder="日本 樱花 2024春 (回车 / 空格添加)"
            emptyHint="先输入或点常用标签 ↓"
          />
        </section>

        {/* Description */}
        <section>
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-2">
            描述 (Markdown)
          </h3>
          <textarea
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            rows={4}
            placeholder="写点什么吧…"
            className="w-full bg-paper/60 border border-kraft/30 focus:border-kraft outline-none rounded px-3 py-2 text-base font-serif placeholder:text-ink/30"
          />
        </section>

        {/* Per-photo tags */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              每张的标签
            </h3>
            <span className="text-xs font-hand text-ink/40">
              留空 = 跟随集合标签
            </span>
          </div>
          <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {photos.map((p, i) => (
              <li
                key={i}
                className="flex gap-3 items-start bg-paper/60 rounded border border-kraft/20 p-2"
              >
                <div className="relative shrink-0">
                  <img
                    src={p.previewUrl}
                    className="w-16 h-16 object-cover rounded shadow-sm"
                  />
                  {p.status === 'uploading' ? (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-kraft/20 rounded-b overflow-hidden">
                      <div
                        className="h-full bg-kraft transition-all"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {p.status === 'uploaded' ? (
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-600/90 text-paper text-[10px] grid place-items-center">
                      ✓
                    </div>
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <TagPicker
                    value={p.tags}
                    onChange={(next) =>
                      setPhotos((cur) =>
                        cur.map((x, j) => (j === i ? { ...x, tags: next } : x))
                      )
                    }
                    suggestions={allTagNames}
                    placeholder="单张标签 (可选)"
                    size="sm"
                  />
                  {p.status === 'failed' ? (
                    <p className="text-xs text-pin-red mt-1">{p.error}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {submit.error ? (
          <p className="text-pin-red text-sm">
            {(submit.error as Error).message ?? '上传失败'}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-paper/95 backdrop-blur border-t border-kraft/30 flex gap-3 justify-between items-center">
          <button
            type="button"
            onClick={() => setStage('select')}
            disabled={submit.isPending}
            className="text-ink/60 hover:text-ink text-sm"
          >
            ← 返回选照片
          </button>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-ink/40">
              {photos.length} 张
            </span>
            <button
              type="submit"
              disabled={submit.isPending || !meta.title.trim()}
              className="bg-kraft text-paper px-6 py-2.5 rounded-sm font-medium hover:bg-kraft-dark disabled:opacity-50"
            >
              {submit.isPending
                ? '正在上传...'
                : matchedCollection
                  ? `合并进「${matchedCollection.title}」`
                  : titleMatches.length > 0
                    ? '新建 · 不合并'
                    : '完成 · 收进相册'}
            </button>
          </div>
        </div>
      </form>

      <AnimatePresence>
        {uploadPhase ? (
          <UploadProgress
            photos={photos}
            phase={uploadPhase}
            errorMessage={
              submit.error ? (submit.error as Error).message : null
            }
            onCancel={
              uploadPhase === 'failed' || uploadPhase === 'uploading'
                ? () => {
                    setUploadPhase(null);
                    submit.reset();
                  }
                : undefined
            }
            onRetry={
              uploadPhase === 'failed'
                ? () => {
                    submit.reset();
                    submit.mutate();
                  }
                : undefined
            }
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type MergeMatch = {
  collection: CollectionDetailDTO;
  directTags: string[];
  score: number;
  matchType: 'exact' | 'contains' | 'subsequence';
};

function matchLabel(matchType: MergeMatch['matchType']): string {
  if (matchType === 'exact') return '标题完全相同';
  if (matchType === 'contains') return '标题相似';
  return '疑似同一主题';
}

function MergeChooser({
  matches,
  selectedId,
  onSelect,
}: {
  matches: MergeMatch[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="relative rounded-md border border-kraft/30 bg-kraft/10 p-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-hand text-lg text-kraft-dark leading-tight">
            可能已经有相似集合
          </p>
          <p className="text-xs text-ink/50">
            请选择一个合并，或保持新建。不会再自动合并。
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={
            selectedId === null
              ? 'px-3 py-1 rounded-full bg-kraft text-paper text-xs'
              : 'px-3 py-1 rounded-full bg-paper/70 border border-kraft/30 text-xs text-ink/60 hover:text-ink'
          }
        >
          新建
        </button>
      </div>

      <div className="space-y-2">
        {matches.map((m) => {
          const selected = selectedId === m.collection.id;
          return (
            <button
              key={m.collection.id}
              type="button"
              onClick={() => onSelect(selected ? null : m.collection.id)}
              className={
                selected
                  ? 'w-full text-left rounded border-2 border-kraft bg-paper/80 p-3 shadow-sm'
                  : 'w-full text-left rounded border border-kraft/20 bg-paper/50 p-3 hover:border-kraft/60 hover:bg-paper/75'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-hand text-xl text-ink/85 truncate">
                    {m.collection.title}
                  </p>
                  <p className="font-mono text-[11px] tracking-widest text-ink/45 mt-0.5">
                    {m.collection.occurredOn} · {m.collection.photoCount} 张 ·{' '}
                    {matchLabel(m.matchType)} · {m.score}
                  </p>
                </div>
                <span
                  className={
                    selected
                      ? 'shrink-0 rounded-full bg-kraft text-paper px-2 py-0.5 text-xs'
                      : 'shrink-0 rounded-full border border-kraft/30 text-ink/50 px-2 py-0.5 text-xs'
                  }
                >
                  {selected ? '已选择合并' : '选择合并'}
                </span>
              </div>
              {m.directTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.directTags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-full bg-kraft/15 text-ink/70 text-xs font-hand"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
