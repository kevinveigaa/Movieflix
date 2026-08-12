import { useMemo, useRef, useState, useEffect } from 'react';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { HeroBanner, HeroBannerSkeleton } from '@/components/home/HeroBanner';
import { useMovies } from '@/hooks/useMovies';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import { Crown, Sparkles, ChevronLeft, ChevronRight, TrendingUp, Clock, Film } from 'lucide-react';
import { categoriasDoFilme, ehInfantil, ordenarCategorias } from '@/lib/categorias';

export function HomePage() {
  const { subscription, activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;
  const movies = useMovies();
  const history = useWatchHistory();

  const visibleMovies = useMemo(() => (isKid ? (movies.data ?? []).filter(ehInfantil) : (movies.data ?? [])), [movies.data, isKid]);
  const destaques = useMemo(() => visibleMovies.slice(0, 5), [visibleMovies]);

  const progressByMovie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of history.data ?? []) {
      if (!h.movie_id) continue;
      const pct = h.duration_seconds ? Math.min(100, (h.position_seconds / h.duration_seconds) * 100) : 0;
      map[h.movie_id] = pct;
    }
    return map;
  }, [history.data]);

  const continueWatching = useMemo(() => {
    const visivel = new Set(visibleMovies.map((m) => m.id));
    return (history.data ?? [])
      .filter((h) => {
        if (!h.movie_id || !visivel.has(h.movie_id)) return false;
        const pct = h.duration_seconds ? (h.position_seconds / h.duration_seconds) * 100 : 0;
        return pct >= 2 && pct < 95;
      })
      .map((h) => movies.data?.find((m) => m.id === h.movie_id))
      .filter((m): m is any => Boolean(m))
      .slice(0, 20);
  }, [history.data, visibleMovies, movies.data]);

  const categorias = useMemo(() => {
    const mapa = new Map<string, any[]>();
    for (const movie of visibleMovies) {
      for (const cat of categoriasDoFilme(movie)) {
        if (!mapa.has(cat)) mapa.set(cat, []);
        mapa.get(cat)!.push(movie);
      }
    }
    const nomes = ordenarCategorias(Array.from(mapa.keys()));
    return nomes.map((nome) => ({ nome, lista: mapa.get(nome)!.slice(0, 20) })).filter((c) => c.lista.length > 0);
  }, [visibleMovies]);

  const emAlta = useMemo(() => [...visibleMovies].filter((m) => (m.vote_average || 0) > 0).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)).slice(0, 20), [visibleMovies]);
  const lancamentos = useMemo(() => [...visibleMovies].filter((m) => m.year || m.created_at).sort((a, b) => {
    const ya = String(b.year || b.created_at?.slice(0, 4) || '0');
    const yb = String(a.year || a.created_at?.slice(0, 4) || '0');
    return ya.localeCompare(yb);
  }).slice(0, 20), [visibleMovies]);
  const recentes = useMemo(() => visibleMovies.slice(0, 20), [visibleMovies]);

  return (
    <div className="pb-16">
      <div className="container-app">
        {movies.isLoading ? <HeroBannerSkeleton /> : <HeroBanner items={destaques} />}
      </div>
      <div className="container-app space-y-12 pt-6 sm:pt-8">
        {!hasActiveSubscription(subscription) && <UpgradeBanner />}
        {movies.isLoading && <CategoryRowSkeleton count={4} />}
        {!movies.isLoading && (
          <>
            {continueWatching.length > 0 && <CategoryRow title="Continuar Assistindo" icon={<Clock className="h-5 w-5 text-brand-400" />} items={continueWatching} progressMap={progressByMovie} verMaisTo="/continuar" />}
            {emAlta.length > 0 && <CategoryRow title="Em Alta" icon={<TrendingUp className="h-5 w-5 text-amber-400" />} items={emAlta} progressMap={progressByMovie} />}
            {lancamentos.length > 0 && <CategoryRow title="Lançamentos" icon={<Sparkles className="h-5 w-5 text-purple-400" />} items={lancamentos} progressMap={progressByMovie} />}
            {recentes.length > 0 && <CategoryRow title="Adicionados Recentemente" icon={<Film className="h-5 w-5 text-emerald-400" />} items={recentes} progressMap={progressByMovie} />}
            {categorias.map((cat) => <CategoryRow key={cat.nome} title={cat.nome} items={cat.lista} category={cat.nome} progressMap={progressByMovie} />)}
          </>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ title, items, icon, category, progressMap, verMaisTo }: {
  title: string; items: any[]; icon?: React.ReactNode; category?: string;
  progressMap?: Record<string, number>; verMaisTo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const verMaisToComputed = verMaisTo ?? (category ? `/filmes?categoria=${encodeURIComponent(category)}` : '/filmes');

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [items.length]);

  const scroll = (dir: 'left' | 'right') => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.85 : el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className="group/row relative" data-tv-row>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">{icon}<h2 className="truncate text-lg font-bold text-white sm:text-xl lg:text-2xl">{title}</h2></div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to={verMaisToComputed} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/15 hover:text-white sm:text-sm">Ver mais</Link>
          <button type="button" onClick={() => scroll('left')} disabled={!canLeft} aria-label="Anterior"
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-200 transition hover:bg-white/15 hover:text-white disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => scroll('right')} disabled={!canRight} aria-label="Próximo"
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-200 transition hover:bg-white/15 hover:text-white disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="relative">
        {canLeft && (
          <button type="button" onClick={() => scroll('left')} aria-label="Anterior"
            className="absolute left-0 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition group-hover/row:opacity-100 hover:bg-black/80 lg:flex">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {canRight && (
          <button type="button" onClick={() => scroll('right')} aria-label="Próximo"
            className="absolute right-0 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition group-hover/row:opacity-100 hover:bg-black/80 lg:flex">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
        <div ref={ref} className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-4 sm:gap-4 lg:gap-5">
          {items.map((movie) => (
            <div key={movie.id} className="shrink-0 snap-start basis-[calc((100%-1.5rem)/3)] sm:basis-[calc((100%-3rem)/4)] md:basis-[calc((100%-4rem)/5)] lg:basis-[calc((100%-5rem)/6)] xl:basis-[calc((100%-6rem)/7)]">
              <PosterCard title={{ id: movie.id, title: movie.title, description: movie.description, poster_url: movie.poster_url, backdrop_url: movie.backdrop_url, quality: movie.quality ?? 'HD', type: movie.type ?? 'movie', year: movie.year, vote_average: movie.vote_average, category: movie.category }} progress={progressMap?.[movie.id]} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-12">
      {Array.from({ length: count }).map((row, i) => (
        <section key={i}>
          <div className="mb-4 h-7 w-48 animate-pulse rounded-lg bg-white/10" />
          <div className="flex gap-3 sm:gap-4 lg:gap-5">
            {Array.from({ length: 6 }).map((j) => (
              <div key={j} className="shrink-0 basis-[calc((100%-1.5rem)/3)] sm:basis-[calc((100%-3rem)/4)] md:basis-[calc((100%-4rem)/5)] lg:basis-[calc((100%-5rem)/6)] xl:basis-[calc((100%-6rem)/7)]">
                <PosterCardSkeleton />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function UpgradeBanner() {
  return (
    <Link to="/minha-assinatura" className="flex items-center gap-4 rounded-2xl border border-brand-600/30 bg-gradient-to-r from-brand-700 via-purple-900 to-black p-5 sm:p-6 card-lift">
      <div className="rounded-xl bg-brand-600 p-3 shadow-lg shadow-brand-900/30"><Crown className="h-6 w-6 text-white" /></div>
      <div className="flex-1">
        <h3 className="text-base font-bold text-white sm:text-lg">Desbloqueie o catálogo completo</h3>
        <p className="mt-0.5 text-sm text-ink-300">Assine agora e tenha acesso a todos os filmes, séries e animes em alta qualidade.</p>
      </div>
      <Sparkles className="hidden h-6 w-6 text-brand-300 sm:block" />
    </Link>
  );
}
