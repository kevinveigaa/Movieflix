import { useState } from 'react';
import { PosterCard } from '@/components/cards/PosterCard';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { useMovies } from '@/hooks/useMovies';

type CatalogKind = 'filmes' | 'series' | 'animes' | 'documentarios' | 'infantil';

const TITLES = {
  filmes: 'Filmes',
  series: 'Séries',
  animes: 'Animes',
  documentarios: 'Document?rios',
  infantil: 'Infantil',
};

const TYPES = {
  filmes: 'movie',
  series: 'series',
  animes: 'anime',
  documentarios: 'documentary',
  infantil: 'kids',
};

export function CatalogPage({ kind }: { kind: CatalogKind }) {
  const movies = useMovies(TYPES[kind]);
  const [search, setSearch] = useState('');

  const results = movies.data?.filter((movie) =>
    movie.title?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="container-app py-8">

      <h1 className="font-display text-3xl text-white mb-6">
        {TITLES[kind]}
      </h1>

      <input
        placeholder="Buscar filmes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-8 rounded-xl bg-white/10 px-4 py-2 text-white"
      />

      {movies.isLoading ? (
        <FullScreenLoader label="Carregando cat?logo..." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {results.map((movie) => (
            <PosterCard key={movie.id} title={movie} className="w-full" />
          ))}
        </div>
      )}

    </div>
  );
}





