import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useCollection } from '@/hooks/useCollections';
import { useTags } from '@/hooks/useTags';
import { api } from '@/lib/api';
import { TagPicker } from '@/components/scrapbook/TagPicker';
import type { PhotoDTO } from '@daynest/shared';

function usePhotoUrl(photoId: string | undefined) {
  return useQuery({
    queryKey: ['photo-url', photoId],
    enabled: !!photoId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const r = await api.get<{ url: string; expiresIn: number }>(
        `/photos/${photoId}/url`
      );
      return r.data.url;
    },
  });
}

export function PhotoViewerPage() {
  const { id, photoIndex } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initial = Number(photoIndex ?? 0);
  const q = useCollection(id);
  const tagsQuery = useTags();
  const [infoOpen, setInfoOpen] = useState(false);
  const [draftCaption, setDraftCaption] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [emblaRef, embla] = useEmblaCarousel({
    startIndex: initial,
    loop: false,
    align: 'center',
  });

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => {
      const i = embla.selectedScrollSnap();
      navigate(`/c/${id}/p/${i}`, { replace: true });
    };
    embla.on('select', onSelect);
    return () => {
      embla.off('select', onSelect);
    };
  }, [embla, id, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!embla) return;
      if (infoOpen) {
        if (e.key === 'Escape') setInfoOpen(false);
        return;
      }
      if (e.key === 'ArrowLeft') embla.scrollPrev();
      else if (e.key === 'ArrowRight') embla.scrollNext();
      else if (e.key === 'Escape') navigate(`/c/${id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embla, id, infoOpen, navigate]);

  const updatePhoto = useMutation({
    mutationFn: async (photo: PhotoDTO) => {
      const res = await api.patch<PhotoDTO>(`/photos/${photo.id}`, {
        caption: draftCaption.trim() || null,
        tags: draftTags,
      });
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collection', id] });
      setInfoOpen(false);
    },
  });

  if (!q.data) return null;
  const photos = q.data.photos;
  const current = photos[initial];

  const openInfo = () => {
    if (!current) return;
    setDraftCaption(current.caption ?? '');
    setDraftTags(current.tags);
    setInfoOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink/95"
    >
      <button
        onClick={() => navigate(`/c/${id}`)}
        className="absolute top-4 right-4 text-paper/80 hover:text-paper z-10 text-sm font-mono"
      >
        ESC ×
      </button>
      <button
        onClick={openInfo}
        className="absolute top-4 right-20 z-10 rounded-full bg-paper/15 px-3 py-1.5 text-sm text-paper/85 hover:bg-paper/25"
      >
        信息 / 编辑
      </button>
      <div className="overflow-hidden w-full h-full" ref={emblaRef}>
        <div className="flex w-full h-full">
          {photos.map((p, i) => (
            <ViewerSlide key={p.id} photoId={p.id} fallback={p.thumbnailUrl} caption={p.caption} index={i} active={i === initial} />
          ))}
        </div>
      </div>
      {current ? (
        <div className="absolute bottom-4 left-4 right-4 text-paper/80 font-serif text-sm flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-paper/60">
            {initial + 1} / {photos.length}
          </span>
          {current.caption ? <span>{current.caption}</span> : null}
          {current.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {current.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full bg-paper/20 text-paper/85 text-xs font-hand"
                >
                  {t}
                </span>
              ))}
            </span>
          ) : null}
          <button
            onClick={openInfo}
            className="rounded-full border border-paper/20 px-2.5 py-0.5 text-xs font-mono text-paper/70 hover:text-paper hover:border-paper/50"
          >
            编辑信息
          </button>
        </div>
      ) : null}

      {current && infoOpen ? (
        <aside className="absolute inset-y-0 right-0 z-20 w-full max-w-sm bg-paper text-ink shadow-2xl p-5 overflow-y-auto">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="font-mono text-xs tracking-widest text-ink/40">
                PHOTO INFO
              </p>
              <h2 className="font-hand text-3xl text-kraft-dark">照片信息</h2>
            </div>
            <button
              onClick={() => setInfoOpen(false)}
              className="text-ink/50 hover:text-ink"
              aria-label="关闭照片信息"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <img
              src={current.thumbnailUrl}
              alt={current.caption ?? ''}
              className="w-full rounded shadow object-cover max-h-56"
            />

            <InfoRow label="序号" value={`${initial + 1} / ${photos.length}`} />
            <InfoRow label="尺寸" value={`${current.width} × ${current.height}`} />
            <InfoRow
              label="拍摄时间"
              value={
                current.takenAt
                  ? new Date(current.takenAt).toLocaleString()
                  : '未读取到'
              }
            />
            <InfoRow label="文件" value={current.fileKey} mono />

            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                描述
              </span>
              <textarea
                value={draftCaption}
                onChange={(e) => setDraftCaption(e.target.value)}
                rows={4}
                placeholder="写点关于这张照片的说明…"
                className="mt-1 w-full rounded border border-kraft/30 bg-paper/70 px-3 py-2 font-serif outline-none focus:border-kraft"
              />
            </label>

            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                标签
              </span>
              <TagPicker
                value={draftTags}
                onChange={setDraftTags}
                suggestions={(tagsQuery.data ?? []).map((t) => t.name)}
                placeholder="输入或选择标签"
              />
            </div>

            {updatePhoto.error ? (
              <p className="text-sm text-pin-red">
                {(updatePhoto.error as Error).message || '保存失败'}
              </p>
            ) : null}

            <div className="flex justify-end gap-3 pt-3 border-t border-kraft/20">
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                disabled={updatePhoto.isPending}
                className="text-sm text-ink/60 hover:text-ink"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => updatePhoto.mutate(current)}
                disabled={updatePhoto.isPending}
                className="rounded-sm bg-kraft px-5 py-2 text-paper hover:bg-kraft-dark disabled:opacity-50"
              >
                {updatePhoto.isPending ? '保存中...' : '保存信息'}
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </motion.div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-ink/45">
        {label}
      </p>
      <p
        className={
          mono
            ? 'break-all font-mono text-xs text-ink/70'
            : 'text-sm text-ink/80'
        }
      >
        {value}
      </p>
    </div>
  );
}

function ViewerSlide({
  photoId,
  fallback,
  caption,
  active,
}: {
  photoId: string;
  fallback: string;
  caption: string | null;
  index: number;
  active: boolean;
}) {
  const url = usePhotoUrl(active ? photoId : undefined);
  return (
    <div className="flex-[0_0_100%] h-full flex items-center justify-center px-4">
      <img
        src={url.data ?? fallback}
        alt={caption ?? ''}
        className="max-h-full max-w-full object-contain select-none"
        draggable={false}
      />
    </div>
  );
}
