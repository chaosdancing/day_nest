import {
  motion,
  AnimatePresence,
  type Transition,
  type HTMLMotionProps,
} from 'framer-motion';
import type { ReactNode } from 'react';

const DEFAULT_TRANSITION: Transition = {
  height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  opacity: { duration: 0.2, ease: 'easeOut' },
};

type Props = {
  show: boolean;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  /**
   * Pass a stable key when the inner content is logically different (e.g.
   * picking a different candidate) and you want the exit/enter animation to
   * play across switches. Defaults to a single shared key.
   */
  contentKey?: string;
  transition?: Transition;
};

/**
 * Smoothly animates a block between collapsed (height: 0) and expanded
 * (height: auto). Uses framer-motion's built-in `height: 'auto'` support.
 *
 * Use this anywhere a conditional `null` causes layout jank — e.g. lists
 * appearing under inputs, custom date ranges, etc.
 */
export function Collapse({
  show,
  children,
  className,
  innerClassName,
  contentKey = 'collapse-content',
  transition = DEFAULT_TRANSITION,
}: Props) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key={contentKey}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transition}
          style={{ overflow: 'hidden' }}
          className={className}
        >
          <div className={innerClassName}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * A drop-in motion.div wrapper for fading items in/out without height change.
 * Used for chip clusters where we don't want a height pop.
 */
export function FadeBlock({
  children,
  className,
  ...rest
}: HTMLMotionProps<'div'> & { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
