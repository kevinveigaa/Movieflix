import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PosterCard } from '@/components/cards/PosterCard';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { useMovies } from '@/hooks/useMovies';

type CatalogKind = 'filmes' | 'series' | 'animes' | 'documentarios' | 'infantil';

const TITLES = {
  filmes: 'Filmes',
  series: 'Séries',
  animes: 'Animes',
  documentarios: 'Documentários',
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
  const [searchParams] = useSearchParams();
  const categoria = searchParams.get('categoria');

  // Uma obra pode ter várias categorias separadas por vírgula (ex.: "Ação, Aventura").
  // Ao filtrar por categoria, ela deve aparecer em TODAS as categorias a que pertence.
  const results = (movies.data ?? []).filter((movie) => {
    const termo = search.trim().toLowerCase();
    const tituloOk = !termo || movie.title?.toLowerCase().includes(termo);
    if (!categoria) return tituloOk;

    const categorias = String(movie.category ?? "")
      .split(",")
      .map((c: string) => c.trim().toLowerCase())
      .filter(Boolean);

    return tituloOk && categorias.includes(categoria.toLowerCase());
  });

  return (
    <div className="container-app pt-24 pb-16">

      <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-white mb-6">
        {categoria || TITLES[kind]}
      </h1>

      <input
        placeholder="Buscar filmes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-8 w-full max-w-xl rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-zinc-400 outline-none focus:border-purple-500"
      />

      {movies.isLoading ? (
        <FullScreenLoader label="Carregando catálogo..." />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {results.map((movie) => (
            <PosterCard key={movie.id} title={movie} className="w-full" />
          ))}
        </div>
      )}

    </div>
  );
}







