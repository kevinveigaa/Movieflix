import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { useMovies } from '@/hooks/useMovies';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useAuth } from '@/context/AuthContext';
import { ehInfantil } from '@/lib/categorias';
import { ehSerie } from '@/lib/media';

interface CatalogMovie {
  id: string;
  title?: string | null;
  category?: string | null;
  type?: string | null;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const movies = useMovies();
  const { seriesHidden } = useSeriesHidden();
  const { activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim()) setParams({ q: q.trim() }, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [q, setParams]);

  // Busca no catálogo local (tabela movies): os títulos têm URL de vídeo e a
  // página de detalhes/player funciona. A busca antiga no TMDB levava a links
  // quebrados, pois a página de título só encontra obras do catálogo local.
  const results = useMemo(() => {
    const termo = initial.trim().toLowerCase();
    if (!termo) return [];

    return (movies.data ?? []).filter((m: CatalogMovie) => {
      if (isKid && !ehInfantil(m)) return false;
      if (seriesHidden && ehSerie(m)) return false;
      const titulo = String(m.title ?? '').toLowerCase();
      const categorias = String(m.category ?? '').toLowerCase();
      return titulo.includes(termo) || categorias.includes(termo);
    });
  }, [movies.data, initial, isKid, seriesHidden]);

  return (
    <div className="container-app py-8">
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={seriesHidden ? "Busque filmes..." : "Busque filmes e séries..."}
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
        ) : movies.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 12 }).map((_, i) => (
              <PosterCardSkeleton key={i} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-ink-400">
            <SearchIcon className="h-10 w-10 opacity-50" />
            <p>Nenhum título encontrado para <span className="text-white">{initial}</span>.</p>
            <p className="text-sm">Explore as categorias na página inicial para descobrir o catálogo.</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-400">
              {results.length} {results.length === 1 ? 'título' : 'títulos'} para{' '}
              <span className="text-white">{initial}</span>
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {results.map((m: CatalogMovie) => (
                <PosterCard key={m.id} title={m} className="w-full" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
