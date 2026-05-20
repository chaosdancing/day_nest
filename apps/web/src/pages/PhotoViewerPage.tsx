import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useCollection } from '@/hooks/useCollections';
import { api } from '@/lib/api';

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
  const initial = Number(photoIndex ?? 0);
  const q = useCollection(id);
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
      if (e.key === 'ArrowLeft') embla.scrollPrev();
      else if (e.key === 'ArrowRight') embla.scrollNext();
      else if (e.key === 'Escape') navigate(`/c/${id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embla, id, navigate]);

  if (!q.data) return null;
  const photos = q.data.photos;
  const current = photos[initial];

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
      <div className="overflow-hidden w-full h-full" ref={emblaRef}>
        <div className="flex w-full h-full">
          {photos.map((p, i) => (
            <ViewerSlide key={p.id} photoId={p.id} fallback={p.thumbnailUrl} caption={p.caption} index={i} active={i === initial} />
          ))}
        </div>
      </div>
      {current ? (
        <div className="absolute bottom-4 left-4 right-4 text-paper/80 font-serif text-sm">
          <span className="font-mono mr-3 text-paper/60">
            {initial + 1} / {photos.length}
          </span>
          {current.caption}
        </div>
      ) : null}
    </motion.div>
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
