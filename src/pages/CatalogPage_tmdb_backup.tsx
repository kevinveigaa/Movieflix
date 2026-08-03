import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tmdb } from '@/lib/tmdb';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { FullScreenLoader } from '@/components/ui/Feedback';
import type { TmdbTitle } from '@/types';

type CatalogKind = 'filmes' | 'series' | 'animes' | 'documentarios' | 'infantil';

const FILTERS: Record<CatalogKind, { label: string; value: string }[]> = {
  filmes: [
    { label: 'Populares', value: 'popular' },
    { label: 'Mais votados', value: 'top_rated' },
    { label: 'Nos cinemas', value: 'now_playing' },
    { label: 'Ao', value: 'g28' },
    { label: 'Comdia', value: 'g35' },
    { label: 'Terror', value: 'g27' },
    { label: 'Romance', value: 'g10749' },
    { label: 'Fico', value: 'g878' },
  ],
  series: [
    { label: 'Populares', value: 'popular' },
    { label: 'Mais votados', value: 'top_rated' },
    { label: 'No ar hoje', value: 'airing_today' },
    { label: 'Drama', value: 'g18' },
    { label: 'Comdia', value: 'g35' },
    { label: 'Crime', value: 'g80' },
    { label: 'Mistrio', value: 'g9648' },
  ],
  animes: [
    { label: 'Populares', value: 'popular' },
    { label: 'Mais votados', value: 'top_rated' },
  ],
  documentarios: [
    { label: 'Populares', value: 'popular' },
    { label: 'Mais votados', value: 'top_rated' },
  ],
  infantil: [
    { label: 'Populares', value: 'popular' },
    { label: 'Mais votados', value: 'top_rated' },
  ],
};

const TITLES: Record<CatalogKind, string> = {
  filmes: 'Filmes',
  series: 'Séries',
  animes: 'Animes',
  documentarios: 'Documentários',
  infantil: 'Infantil',
};

export function CatalogPage({ kind }: { kind: CatalogKind }) {
  const [filter, setFilter] = useState(FILTERS[kind][0].value);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['catalog', kind, filter, page],
    queryFn: async () => {
      const isGenre = filter.startsWith('g');
      const genreId = isGenre ? Number(filter.slice(1)) : 0;
      const isMovie = kind === 'filmes' || kind === 'documentarios' || kind === 'infantil';
      const isAnime = kind === 'animes';

      if (isAnime) {
        if (filter === 'top_rated') {
          const d = await tmdb.byGenreTv(16, page);
          return d;
        }
        return tmdb.anime(page);
      }
      if (kind === 'documentarios') {
        return tmdb.byGenreMovie(99, page);
      }
      if (kind === 'infantil') {
        return tmdb.kids(page);
      }
      if (isMovie) {
        if (filter === 'popular') return tmdb.popularMovies(page);
        if (filter === 'top_rated') return tmdb.topRatedMovies(page);
        if (filter === 'now_playing') return tmdb.nowPlaying();
        if (isGenre) return tmdb.byGenreMovie(genreId, page);
      } else {
        if (filter === 'popular') return tmdb.popularTv(page);
        if (filter === 'top_rated') return tmdb.topRatedTv(page);
        if (filter === 'airing_today') return tmdb.airingToday();
        if (isGenre) return tmdb.byGenreTv(genreId, page);
      }
      return tmdb.popularMovies(page);
    },
  });

  const results = useMemo(() => (query.data?.results ?? []).filter((t) => t.media_type !== 'person'), [query.data]);

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">{TITLES[kind]}</h1>
          <p className="mt-1 text-sm text-ink-400">Explore o catlogo completo de {TITLES[kind].toLowerCase()}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS[kind].map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setFilter(f.value);
                setPage(1);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                filter === f.value
                  ? 'bg-brand-600 text-white'
                  : 'border border-white/10 bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <FullScreenLoader label="Carregando catlogo" />
      ) : results.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-ink-400">
          <p>Nenhum ttulo encontrado.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {query.isLoading
              ? Array.from({ length: 12 }).map((_, i) => <PosterCardSkeleton key={i} />)
              : results.map((t) => <PosterCard key={t.id} title={t} className="w-full" />)}
          </div>

          {query.data && (query.data.page < query.data.total_pages) && (
            <div className="mt-10 flex justify-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={query.isFetching}
                className="btn-outline"
              >
                {query.isFetching ? 'Carregando' : 'Carregar mais'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}




