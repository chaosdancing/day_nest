import { type CSSProperties, type MouseEventHandler, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { deterministicTilt } from '@/lib/deterministicTilt';

type PolaroidProps = {
  src: string;
  alt?: string;
  caption?: string | null;
  tiltSeed?: string;
  tilt?: number;
  className?: string;
  style?: CSSProperties;
  layoutId?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  loading?: 'lazy' | 'eager';
  aspectRatio?: number;
};

export const Polaroid = forwardRef<HTMLDivElement, PolaroidProps>(function Polaroid(
  {
    src,
    alt = '',
    caption,
    tiltSeed = src,
    tilt,
    className,
    style,
    layoutId,
    onClick,
    loading = 'lazy',
    aspectRatio,
  },
  ref
) {
  const angle = tilt ?? deterministicTilt(tiltSeed, 4);
  return (
    <motion.div
      ref={ref}
      layoutId={layoutId}
      onClick={onClick}
      className={cn('polaroid select-none', onClick && 'cursor-pointer', className)}
      style={{ rotate: `${angle}deg`, ...style }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
    >
      <div
        className="overflow-hidden bg-paper-dark/40"
        style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
      >
        <img
          src={src}
          alt={alt}
          loading={loading}
          className="block w-full h-full object-cover"
          draggable={false}
        />
      </div>
      {caption ? <div className="caption">{caption}</div> : null}
    </motion.div>
  );
});
