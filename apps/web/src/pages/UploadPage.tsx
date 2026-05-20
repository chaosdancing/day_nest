import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  loadLocalPhoto,
  requestUploadTokens,
  uploadToQiniu,
  type LocalPhoto,
} from '@/lib/upload';
import { Polaroid } from '@/components/scrapbook/Polaroid';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { TapeBadge } from '@/components/scrapbook/TapeBadge';
import type { CollectionDetailDTO } from '@daynest/shared';

const MAX_PHOTOS = 50;

type DraftMeta = {
  title: string;
  description: string;
  occurredOn: string;
  occurredUntil: string;
  location: string;
  tagsInput: string;
};

const emptyMeta = (): DraftMeta => ({
  title: '',
  description: '',
  occurredOn: new Date().toISOString().slice(0, 10),
  occurredUntil: '',
  location: '',
  tagsInput: '',
});

function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

export function UploadPage() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [meta, setMeta] = useState<DraftMeta>(emptyMeta);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<'select' | 'meta'>('select');

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (photos.length + list.length > MAX_PHOTOS) {
      alert(`一次最多上传 ${MAX_PHOTOS} 张`);
      return;
    }
    const loaded = await Promise.all(list.map((f) => loadLocalPhoto(f)));
    setPhotos((p) => {
      const next = [...p, ...loaded];
      // default occurredOn to earliest taken_at
      const earliest = next
        .map((x) => x.takenAt)
        .filter(Boolean)
        .map((d) => new Date(d!))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (earliest && meta.occurredOn === emptyMeta().occurredOn) {
        setMeta((m) => ({ ...m, occurredOn: earliest.toISOString().slice(0, 10) }));
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
      const tokens = await requestUploadTokens({
        count: photos.length,
        ext: photos[0]?.file.name.split('.').pop()?.toLowerCase() ?? 'jpg',
      });
      const uploaded = await Promise.all(
        photos.map(async (p, i) => {
          setPhotos((cur) =>
            cur.map((x, j) => (j === i ? { ...x, status: 'uploading' } : x))
          );
          try {
            const { key } = await uploadToQiniu(tokens[i]!, p.file, (pct) =>
              setPhotos((cur) =>
                cur.map((x, j) => (j === i ? { ...x, progress: pct } : x))
              )
            );
            setPhotos((cur) =>
              cur.map((x, j) =>
                j === i ? { ...x, status: 'uploaded', fileKey: key, progress: 100 } : x
              )
            );
            return { ...p, fileKey: key };
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
        })
      );
      const payload = {
        title: meta.title.trim(),
        description: meta.description.trim() || null,
        occurredOn: meta.occurredOn,
        occurredUntil: meta.occurredUntil || null,
        location: meta.location.trim() || null,
        tags: parseTags(meta.tagsInput),
        photos: uploaded.map((p) => ({
          fileKey: p.fileKey!,
          width: p.width,
          height: p.height,
          caption: p.caption,
          takenAt: p.takenAt,
          tags: p.tags,
        })),
      };
      const res = await api.post<CollectionDetailDTO>('/collections', payload);
      return res.data;
    },
    onSuccess: (data) => {
      navigate(`/c/${data.id}`);
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
    <div className="pb-16">
      <div className="text-center pb-6">
        <HandwrittenText as="h1" className="text-5xl block">
          这次回忆叫什么
        </HandwrittenText>
        <p className="font-mono text-xs tracking-widest text-ink/50 mt-2">
          STEP 2 · 填资料
        </p>
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!meta.title.trim()) return;
          submit.mutate();
        }}
        className="max-w-xl mx-auto space-y-4"
      >
        <Field label="标题" required>
          <input
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            required
            className="input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期">
            <input
              type="date"
              value={meta.occurredOn}
              onChange={(e) => setMeta({ ...meta, occurredOn: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="结束日期 (选填)">
            <input
              type="date"
              value={meta.occurredUntil}
              onChange={(e) => setMeta({ ...meta, occurredUntil: e.target.value })}
              className="input"
            />
          </Field>
        </div>
        <Field label="地点 (选填)">
          <input
            value={meta.location}
            onChange={(e) => setMeta({ ...meta, location: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="集合标签 (空格或逗号分隔)">
          <input
            value={meta.tagsInput}
            onChange={(e) => setMeta({ ...meta, tagsInput: e.target.value })}
            placeholder="例如：日本 樱花 2024春"
            className="input"
          />
          {parseTags(meta.tagsInput).length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {parseTags(meta.tagsInput).map((t) => (
                <TapeBadge key={t} tiltSeed={t}>
                  {t}
                </TapeBadge>
              ))}
            </div>
          ) : null}
        </Field>
        <Field label="描述 (支持 Markdown)">
          <textarea
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            rows={5}
            className="input font-serif"
          />
        </Field>

        <section>
          <h3 className="font-mono text-xs uppercase tracking-widest text-ink/60 mb-2">
            每张的描述 / 标签 (可选)
          </h3>
          <ul className="space-y-3">
            {photos.map((p, i) => (
              <li key={i} className="flex gap-3 items-start">
                <img
                  src={p.previewUrl}
                  className="w-20 h-20 object-cover rounded shadow"
                />
                <div className="flex-1 space-y-2">
                  <input
                    placeholder="单张描述"
                    value={p.caption ?? ''}
                    onChange={(e) =>
                      setPhotos((cur) =>
                        cur.map((x, j) =>
                          j === i ? { ...x, caption: e.target.value || null } : x
                        )
                      )
                    }
                    className="input text-sm"
                  />
                  <input
                    placeholder="单张标签 (空格分隔)"
                    value={p.tags.join(' ')}
                    onChange={(e) =>
                      setPhotos((cur) =>
                        cur.map((x, j) =>
                          j === i ? { ...x, tags: parseTags(e.target.value) } : x
                        )
                      )
                    }
                    className="input text-sm"
                  />
                  {p.status === 'uploading' ? (
                    <div className="h-1 bg-kraft/20 rounded overflow-hidden">
                      <div
                        className="h-full bg-kraft transition-all"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {p.status === 'failed' ? (
                    <p className="text-xs text-pin-red">{p.error}</p>
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

        <div className="flex gap-3 justify-end pt-4">
          <button
            type="button"
            onClick={() => setStage('select')}
            disabled={submit.isPending}
            className="text-ink/60 hover:text-ink"
          >
            ← 返回选照片
          </button>
          <button
            type="submit"
            disabled={submit.isPending || !meta.title.trim()}
            className="bg-kraft text-paper px-6 py-2.5 rounded-sm font-medium hover:bg-kraft-dark disabled:opacity-50"
          >
            {submit.isPending ? '正在上传...' : '完成 · 收进相册'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-mono uppercase tracking-widest text-ink/60">
        {label}
        {required ? ' *' : ''}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
