import type { PropsWithChildren, MouseEventHandler } from 'react';
import { cn } from '@/lib/cn';
import { deterministicTilt } from '@/lib/deterministicTilt';

type Props = PropsWithChildren<{
  tiltSeed?: string;
  tilt?: number;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  as?: 'span' | 'button';
}>;

export function TapeBadge({
  children,
  tiltSeed,
  tilt,
  className,
  onClick,
  as = onClick ? 'button' : 'span',
}: Props) {
  const angle = tilt ?? (tiltSeed ? deterministicTilt(tiltSeed, 3) : -2);
  const Tag = as as 'span';
  return (
    <Tag
      onClick={onClick as never}
      className={cn(
        'tape',
        onClick && 'cursor-pointer hover:opacity-80',
        className
      )}
      style={{ transform: `rotate(${angle}deg)` }}
    >
      {children}
    </Tag>
  );
}
