import { cn } from '@/lib/cn';

type Props = {
  color?: 'red' | 'blue' | 'yellow' | 'green';
  className?: string;
  style?: React.CSSProperties;
};

const COLOR_MAP: Record<NonNullable<Props['color']>, string> = {
  red: 'bg-pin-red',
  blue: 'bg-pin-blue',
  yellow: 'bg-pin-yellow',
  green: 'bg-pin-green',
};

export function Pin({ color = 'red', className, style }: Props) {
  return <span className={cn('pin', COLOR_MAP[color], className)} style={style} />;
}
