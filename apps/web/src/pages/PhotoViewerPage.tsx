import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useCollection } from '@/hooks/useCollections';
import { useTags } from '@/hooks/useTags';
import { api } from '@/lib/api';
import { TagPicker } from '@/components/scrapbook/TagPicker';
import { FavoriteHeart } from '@/components/scrapbook/FavoriteHeart';
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
  // Embla keeps its own currentIndex so swipe + arrow taps both update the
  // URL and the chrome (prev/next visibility, counter, neighbor preload).
  const [currentIndex, setCurrentIndex] = useState(initial);
  const [emblaRef, embla] = useEmblaCarousel({
    startIndex: initial,
    loop: false,
    align: 'center',
    // touch-friendly defaults; the dragFree off keeps slides snapping.
    skipSnaps: false,
  });

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => {
      const i = embla.selectedScrollSnap();
      setCurrentIndex(i);
      navigate(`/c/${id}/p/${i}`, { replace: true });
    };
    embla.on('select', onSelect);
    // Also fire once to seed currentIndex if the URL specified a startIndex.
    setCurrentIndex(embla.selectedScrollSnap());
    return () => {
      embla.off('select', onSelect);
    };
  }, [embla, id, navigate]);

  const closeViewer = () => {
    // Prefer popping the history stack so the user lands back on the
    // exact page they came from (collection detail / favorites / tag pin).
    // Only fall back to pushing the collection route when there is no
    // previous entry (e.g. deep-linked into a photo URL directly).
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(`/c/${id}`, { replace: true });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!embla) return;
      if (infoOpen) {
        if (e.key === 'Escape') setInfoOpen(false);
        return;
      }
      if (e.key === 'ArrowLeft') embla.scrollPrev();
      else if (e.key === 'ArrowRight') embla.scrollNext();
      else if (e.key === 'Escape') closeViewer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const current = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

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
        onClick={closeViewer}
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
      {current ? (
        <div className="absolute top-4 left-4 z-10">
          <FavoriteHeart
            photoId={current.id}
            collectionId={id}
            favorited={current.favoritedByMe}
            count={current.favoriteCount}
            variant="overlay"
            size="lg"
          />
        </div>
      ) : null}
      <div className="overflow-hidden w-full h-full" ref={emblaRef}>
        <div className="flex w-full h-full">
          {photos.map((p, i) => (
            <ViewerSlide
              key={p.id}
              photoId={p.id}
              fallback={p.thumbnailUrl}
              caption={p.caption}
              index={i}
              // Preload the focused slide plus its immediate neighbours so
              // swiping/clicking arrows feels instant rather than flashing
              // from blurry thumbnail to full-res.
              active={Math.abs(i - currentIndex) <= 1}
              // Only the centered slide surfaces the 缩略图/原图 badge.
              isCurrent={i === currentIndex}
            />
          ))}
        </div>
      </div>

      {/* Prev / Next chevrons. Big hit area (≥44px) for mobile thumbs;
          fade in/out at the edges; tucked above the caption strip. */}
      {hasPrev ? (
        <button
          type="button"
          onClick={() => embla?.scrollPrev()}
          aria-label="上一张"
          className="group absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-full bg-paper/10 text-paper/85 backdrop-blur-sm transition hover:bg-paper/25 hover:text-paper active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="15 6 9 12 15 18" />
          </svg>
        </button>
      ) : null}
      {hasNext ? (
        <button
          type="button"
          onClick={() => embla?.scrollNext()}
          aria-label="下一张"
          className="group absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-full bg-paper/10 text-paper/85 backdrop-blur-sm transition hover:bg-paper/25 hover:text-paper active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      ) : null}

      {current ? (
        <div className="absolute bottom-4 left-4 right-4 text-paper/80 font-serif text-sm flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-paper/60">
            {currentIndex + 1} / {photos.length}
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

            <InfoRow label="序号" value={`${currentIndex + 1} / ${photos.length}`} />
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
  isCurrent,
}: {
  photoId: string;
  fallback: string;
  caption: string | null;
  index: number;
  active: boolean;
  isCurrent: boolean;
}) {
  const url = usePhotoUrl(active ? photoId : undefined);
  // True once the *original* (signed full-res) has actually decoded — distinct
  // from merely having requested its URL. Drives the 原图 badge so users know
  // they're no longer looking at the blurry thumbnail fallback.
  const [originalLoaded, setOriginalLoaded] = useState(false);
  const showingOriginal = !!url.data;

  return (
    <div className="relative flex-[0_0_100%] h-full flex items-center justify-center px-4">
      <img
        src={url.data ?? fallback}
        alt={caption ?? ''}
        className="max-h-full max-w-full object-contain select-none"
        draggable={false}
        onLoad={() => {
          // Fires for the fallback first; only flip the flag once we've swapped
          // in the original source.
          if (showingOriginal) setOriginalLoaded(true);
        }}
      />
      {isCurrent ? (
        <span
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-full px-3 py-1 text-xs font-mono backdrop-blur-sm ${
            originalLoaded
              ? 'bg-pin-green/25 text-paper'
              : 'bg-paper/15 text-paper/70'
          }`}
        >
          {originalLoaded ? '原图' : showingOriginal ? '原图加载中…' : '缩略图'}
        </span>
      ) : null}
    </div>
  );
}
