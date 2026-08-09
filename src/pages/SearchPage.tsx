import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon, X } from 'lucide-react';
import { tmdb } from '@/lib/tmdb';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim()) setParams({ q: q.trim() }, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [q, setParams]);

  const query = useQuery({
    queryKey: ['search', initial],
    enabled: initial.trim().length > 0,
    queryFn: () => tmdb.search(initial),
  });

  const results = (query.data?.results ?? []).filter((t) => t.media_type !== 'person');

  return (
    <div className="container-app py-8">
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busque por filmes, séries, animes..."
            className="w-full rounded-full border border-white/10 bg-ink-800/70 py-3.5 pl-12 pr-12 text-base text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
              aria-label="Limpar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-8">
        {!initial.trim() ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-ink-400">
            <SearchIcon className="h-10 w-10 opacity-50" />
            <p>Digite para buscar em todo o catálogo.</p>
          </div>
        ) : query.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 12 }).map((_, i) => (
              <PosterCardSkeleton key={i} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-ink-400">
            <p>Nenhum resultado para {initial}.</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-400">
              {results.length} resultado(s) para <span className="text-white">{initial}</span>
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {results.map((t) => (
                <PosterCard key={`${t.id}-${t.media_type}`} title={t} className="w-full" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}





