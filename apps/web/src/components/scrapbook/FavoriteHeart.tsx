import { motion, AnimatePresence } from 'framer-motion';
import { useToggleFavorite } from '@/hooks/useFavorites';
import { cn } from '@/lib/cn';

type Props = {
  photoId: string;
  collectionId?: string;
  favorited: boolean;
  count: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'overlay' | 'inline';
  className?: string;
};

export function FavoriteHeart({
  photoId,
  collectionId,
  favorited,
  count,
  size = 'md',
  variant = 'overlay',
  className,
}: Props) {
  const toggle = useToggleFavorite();
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle.mutate({ photoId, collectionId, favorited: !favorited });
  };

  const sizeClasses =
    size === 'sm'
      ? 'h-7 w-7 text-base'
      : size === 'lg'
        ? 'h-11 w-11 text-2xl'
        : 'h-9 w-9 text-lg';
  const wrapperBg =
    variant === 'overlay'
      ? 'bg-white/85 hover:bg-white shadow dark:bg-ink/70 dark:hover:bg-ink/80'
      : 'bg-paper/70 hover:bg-paper dark:bg-ink/50 dark:hover:bg-ink/70';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={favorited ? '取消最爱' : '加入最爱'}
      aria-pressed={favorited}
      disabled={toggle.isPending}
      className={cn(
        'group inline-flex items-center gap-1 rounded-full px-1.5 transition',
        wrapperBg,
        'disabled:opacity-60',
        className
      )}
    >
      <span
        className={cn(
          'relative grid place-items-center rounded-full',
          sizeClasses
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {favorited ? (
            <motion.span
              key="filled"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="text-pin-red drop-shadow"
              aria-hidden
            >
              ♥
            </motion.span>
          ) : (
            <motion.span
              key="outline"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-ink/55 group-hover:text-pin-red dark:text-paper/65 dark:group-hover:text-pin-red"
              aria-hidden
            >
              ♡
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {count > 0 ? (
        <span
          className={cn(
            'pr-1 font-mono tabular-nums',
            size === 'sm' ? 'text-[10px]' : 'text-xs',
            favorited
              ? 'text-pin-red'
              : 'text-ink/65 dark:text-paper/70'
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
