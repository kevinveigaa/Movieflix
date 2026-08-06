import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CarouselProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function Carousel({ title, children, className }: CarouselProps) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    const el = ref.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <section className={cn('group/row relative', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white sm:text-xl lg:text-2xl">{title}</h2>
        <div className="hidden gap-2 sm:flex">
          <button
            onClick={() => scroll('left')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:bg-white/15 hover:text-white"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-200 transition hover:bg-white/15 hover:text-white"
            aria-label="Prximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="scrollbar-none flex gap-3 overflow-x-auto scroll-smooth pb-4 sm:gap-4 lg:gap-5 xl:gap-6"
      >
        {children}
      </div>
    </section>
  );
}





