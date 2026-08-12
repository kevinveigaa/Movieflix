import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Info, ChevronLeft, ChevronRight } from 'lucide-react';

const INTERVALO = 6000;

export interface HeroItem {
  id: string | number;
  title?: string;
  description?: string;
  backdrop_url?: string;
  poster_url?: string;
  quality?: string;
  language?: string;
  category?: string;
  type?: string;
  year?: string;
  vote_average?: number;
}

export function HeroBanner({ items }: { items: HeroItem[] }) {
  const slides = items.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);

  const go = useCallback((dir: 1 | -1) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setIndex((i) => (i + dir + slides.length) % slides.length);
    setTimeout(() => setIsTransitioning(false), 900);
  }, [slides.length, isTransitioning]);

  const goTo = useCallback((i: number) => {
    if (isTransitioning || i === index) return;
    setIsTransitioning(true);
    setIndex(i);
    setTimeout(() => setIsTransitioning(false), 900);
  }, [index, isTransitioning]);

  const restart = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (slides.length <= 1) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), INTERVALO);
  }, [slides.length]);

  useEffect(() => {
    restart();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [restart]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? go(1) : go(-1); restart(); }
  };

  if (!slides.length) return null;
  const atual = slides[index];
  const generos = (atual.category ?? '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 4);
  const mediaType = atual.type === 'series' || atual.type === 'tv' ? 'tv' : 'movie';

  return (
    <section className="relative -mx-4 mb-6 overflow-hidden sm:-mx-6 lg:-mx-8 lg:rounded-3xl"
      aria-roledescription="carousel" aria-label="Filmes em destaque"
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="relative h-[70vw] max-h-[600px] min-h-[320px] w-full sm:h-[55vw] md:h-[50vw] lg:h-[42vw]">
        {slides.map((s, i) => (
          <div key={s.id} className={`absolute inset-0 transition-opacity duration-1000 ease-out ${i === index ? 'opacity-100' : 'opacity-0'}`}>
            <img src={s.backdrop_url || s.poster_url} alt="" className="h-full w-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/30" />
            <div className="absolute inset-0 bg-gradient-to-r from-ink-950/95 via-ink-950/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-br from-black/30 via-transparent to-transparent" />
          </div>
        ))}
        <div className="absolute inset-0 flex items-end">
          <div className="w-full px-5 pb-10 sm:px-8 sm:pb-12 lg:px-12 lg:pb-16">
            <div className="max-w-2xl space-y-4 animate-fade-in-up">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-900/30">Em Destaque</span>
                {atual.quality && <span className="chip">{atual.quality}</span>}
                {atual.language && <span className="chip">{atual.language}</span>}
                {atual.year && <span className="chip">{atual.year}</span>}
                {atual.vote_average && Number(atual.vote_average) > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300">★ {Number(atual.vote_average).toFixed(1)}</span>
                )}
              </div>
              <h1 className="text-3xl font-extrabold leading-tight text-white drop-shadow-lg sm:text-4xl md:text-5xl lg:text-6xl">{atual.title}</h1>
              {generos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {generos.map((g) => <span key={g} className="text-xs text-ink-300 sm:text-sm">{g}</span>)}
                </div>
              )}
              {atual.description && (
                <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-ink-200 sm:line-clamp-3 sm:text-base">{atual.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link to={`/assistir/${atual.id}`} className="btn-primary px-6 py-3 text-sm sm:text-base">
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" /> Assistir Agora
                </Link>
                <Link to={`/titulo/${mediaType}/${atual.id}`} className="btn-ghost px-6 py-3 text-sm sm:text-base">
                  <Info className="h-4 w-4 sm:h-5 sm:w-5" /> Mais Informações
                </Link>
              </div>
            </div>
          </div>
        </div>
        {slides.length > 1 && (
          <>
            <button type="button" aria-label="Destaque anterior" onClick={() => { go(-1); restart(); }}
              className="absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/70 sm:flex">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Próximo destaque" onClick={() => { go(1); restart(); }}
              className="absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/70 sm:flex">
              <ChevronRight className="h-6 w-6" />
            </button>
            <div className="absolute bottom-4 right-5 flex items-center gap-2 sm:bottom-6 sm:right-8">
              {slides.map((s, i) => (
                <button key={s.id} type="button" aria-label={`Ir para o destaque ${i + 1}`}
                  onClick={() => { goTo(i); restart(); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-8 bg-brand-500' : 'w-3 bg-white/40 hover:bg-white/70'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function HeroBannerSkeleton() {
  return <div className="-mx-4 mb-6 h-[70vw] max-h-[600px] min-h-[320px] animate-pulse bg-ink-800/70 sm:-mx-6 sm:h-[55vw] md:h-[50vw] lg:-mx-8 lg:h-[42vw] lg:rounded-3xl" />;
}
