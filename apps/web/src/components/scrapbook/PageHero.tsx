import { motion } from 'framer-motion';
import { HandwrittenText } from './HandwrittenText';
import { cn } from '@/lib/cn';

type Props = {
  emoji: string;
  title: string;
  subtitle?: string;
  emojiClassName?: string;
  className?: string;
  /**
   * How the emoji animates in. "pop" = scale spring (like the heart on Favorites).
   * "wobble" = gentle infinite rocking. "bounce" = subtle vertical hop on hover.
   */
  motion?: 'pop' | 'wobble' | 'bounce';
};

export function PageHero({
  emoji,
  title,
  subtitle,
  emojiClassName,
  className,
  motion: mode = 'pop',
}: Props) {
  return (
    <div className={cn('text-center pb-8', className)}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14 }}
        className="inline-block"
      >
        <motion.span
          className={cn(
            'inline-block text-5xl sm:text-6xl drop-shadow-sm select-none',
            emojiClassName
          )}
          aria-hidden
          animate={
            mode === 'wobble'
              ? { rotate: [-6, 6, -6] }
              : mode === 'bounce'
                ? { y: [0, -4, 0] }
                : undefined
          }
          transition={
            mode === 'wobble'
              ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }
              : mode === 'bounce'
                ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                : undefined
          }
          whileHover={{ scale: 1.15, rotate: 6 }}
        >
          {emoji}
        </motion.span>
      </motion.div>
      <HandwrittenText
        as="h1"
        className="mt-1 block text-4xl sm:text-5xl leading-none"
      >
        {title}
      </HandwrittenText>
      {subtitle ? (
        <p className="font-mono text-xs tracking-widest text-ink/50 dark:text-paper/55 mt-2">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
