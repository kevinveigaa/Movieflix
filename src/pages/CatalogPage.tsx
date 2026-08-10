import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PosterCard } from '@/components/cards/PosterCard';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { useMovies } from '@/hooks/useMovies';
import { temCategoria } from '@/lib/categorias';

type CatalogKind = 'filmes' | 'series' | 'animes' | 'infantil';

const TITLES: Record<CatalogKind, string> = {
  filmes: 'Filmes',
  series: 'Séries',
  animes: 'Animes',
  infantil: 'Infantil',
};

/**
 * Cada seção do menu aceita tanto o `type` gravado na obra quanto as
 * categorias equivalentes marcadas no painel admin. Assim um filme marcado
 * como "Anime" aparece em /animes mesmo tendo type = "movie".
 */
const TIPOS: Record<CatalogKind, string[]> = {
  filmes: ['movie'],
  series: ['series', 'serie', 'tv'],
  animes: ['anime'],
  infantil: ['kids', 'infantil'],
};

const CATEGORIAS_DA_SECAO: Record<CatalogKind, string[]> = {
  filmes: [],
  series: ['Série', 'Novela'],
  animes: ['Anime'],
  infantil: ['Infantil', 'Família', 'Animação'],
};

export function CatalogPage({ kind }: { kind: CatalogKind }) {
  // Carrega o catálogo inteiro e filtra no cliente: uma obra pode pertencer a
  // várias categorias e precisa aparecer em todas elas.
  const movies = useMovies();
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const categoria = searchParams.get('categoria');

  const results = useMemo(() => {
    const termo = search.trim().toLowerCase();

    return (movies.data ?? []).filter((movie: any) => {
      const tituloOk = !termo || String(movie.title ?? '').toLowerCase().includes(termo);
      if (!tituloOk) return false;

      // Filtro por categoria (vindo do "Ver mais" da home ou do menu Categorias):
      // vale para o catálogo inteiro, independente do tipo.
      if (categoria) return temCategoria(movie, categoria);

      const tipo = String(movie.type ?? 'movie').toLowerCase();
      if (TIPOS[kind].includes(tipo)) return true;

      return CATEGORIAS_DA_SECAO[kind].some((c) => temCategoria(movie, c));
    });
  }, [movies.data, search, categoria, kind]);

  return (
    <div className="container-app pt-24 pb-16">
      <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-white mb-2">
        {categoria || TITLES[kind]}
      </h1>
      <p className="mb-6 text-sm text-ink-400">
        {results.length} {results.length === 1 ? 'título' : 'títulos'}
      </p>

      <input
        placeholder="Buscar títulos..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-8 w-full max-w-xl rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-zinc-400 outline-none focus:border-brand-500"
      />

      {movies.isLoading ? (
        <FullScreenLoader label="Carregando catálogo..." />
      ) : results.length === 0 ? (
        <p className="text-ink-400">Nenhum título encontrado por aqui ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {results.map((movie: any) => (
            <PosterCard key={movie.id} title={movie} className="w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
