import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Rating({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold text-amber-400', className)}>
      <Star className="h-3.5 w-3.5 fill-amber-400" />
      {value ? value.toFixed(1) : ''}
    </span>
  );
}




