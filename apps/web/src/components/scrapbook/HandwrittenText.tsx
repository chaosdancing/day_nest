import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/cn';

type Props = PropsWithChildren<{
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}>;

export function HandwrittenText({ children, className, as: Tag = 'span' }: Props) {
  return (
    <Tag className={cn('scribble', className)}>{children}</Tag>
  );
}
