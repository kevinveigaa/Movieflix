import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, X, Film } from 'lucide-react';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { useMovies } from '@/hooks/useMovies';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { ehInfantil } from '@/lib/categorias';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('q') || '';
  const [q, setQ] = useState(initial);
  const [debouncedQ, setDebouncedQ] = useState(initial);
  const movies = useMovies();
  const history = useWatchHistory();
  const { activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debouncedQ) setSearchParams({ q: debouncedQ });
    else setSearchParams({});
  }, [debouncedQ]);

  const progressByMovie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of history.data ?? []) {
      if (!h.movie_id) continue;
      const pct = h.duration_seconds ? Math.min(100, (h.position_seconds / h.duration_seconds) * 100) : 0;
      map[h.movie_id] = pct;
    }
    return map;
  }, [history.data]);

  const results = useMemo(() => {
    if (!debouncedQ) return [];
    const termo = debouncedQ.toLowerCase();
    return (movies.data ?? []).filter((m: any) => {
      if (isKid && !ehInfantil(m)) return false;
      const campos = [m.title, m.description, m.director, m.cast, m.category].join(' ').toLowerCase();
      return campos.includes(termo);
    });
  }, [movies.data, debouncedQ, isKid]);

  return (
    <div className="container-app py-8">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Busque filmes, séries, animes, atores, diretores..."
          className="w-full rounded-full border border-white/10 bg-ink-800/70 py-3.5 pl-12 pr-12 text-base text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none" />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:text-white" aria-label="Limpar">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-8">
        {!debouncedQ ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <Search className="h-12 w-12 text-ink-600" />
            <p className="text-ink-400">Digite para buscar em todo o catálogo.</p>
          </div>
        ) : movies.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <PosterCardSkeleton key={i} />)}
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <Film className="h-12 w-12 text-ink-600" />
            <div>
              <p className="text-lg font-semibold text-white">Nenhum resultado para "{debouncedQ}"</p>
              <p className="mt-1 text-sm text-ink-400">Tente buscar por outro termo ou explore as categorias.</p>
            </div>
            <Link to="/" className="btn-primary">Explorar catálogo</Link>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-400">{results.length} {results.length === 1 ? 'título' : 'títulos'} encontrados</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {results.map((m: any) => (
                <PosterCard key={m.id}
                  title={{ id: m.id, title: m.title, description: m.description, poster_url: m.poster_url, backdrop_url: m.backdrop_url, quality: m.quality ?? 'HD', type: m.type ?? 'movie', year: m.year, vote_average: m.vote_average, category: m.category }}
                  progress={progressByMovie[m.id]} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
