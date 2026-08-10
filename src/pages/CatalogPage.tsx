import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PosterCard } from '@/components/cards/PosterCard';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { useMovies } from '@/hooks/useMovies';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { temCategoria } from '@/lib/categorias';

type CatalogKind = 'filmes' | 'series' | 'animes';

const TITLES: Record<CatalogKind, string> = {
  filmes: 'Filmes',
  series: 'Series',
  animes: 'Animes',
};

const TIPOS: Record<CatalogKind, string[]> = {
  filmes: ['movie'],
  series: ['series', 'serie', 'tv'],
  animes: ['anime'],
};

const CATEGORIAS_DA_SECAO: Record<CatalogKind, string[]> = {
  filmes: [],
  series: ['Serie', 'Novela'],
  animes: ['Anime'],
};

const KIDS_CATS = ['Infantil', 'Familia', 'Animacao'];

function isKidsContent(movie: any): boolean {
  return ['Infantil', 'Familia', 'Animacao'].some((c) => temCategoria(movie, c)) ||
    String(movie.type ?? '').toLowerCase() === 'kids';
}

export function CatalogPage({ kind }: { kind: CatalogKind }) {
  const movies = useMovies();
  const history = useWatchHistory();
  const { activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const categoria = searchParams.get('categoria');

  // Mapa movie_id → % assistido para a barra de progresso nos cards.
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
    const termo = search.trim().toLowerCase();

    return (movies.data ?? []).filter((movie: any) => {
      if (isKid && !isKidsContent(movie)) return false;

      const tituloOk = !termo || String(movie.title ?? '').toLowerCase().includes(termo);
      if (!tituloOk) return false;

      if (categoria) return temCategoria(movie, categoria);

      const tipo = String(movie.type ?? 'movie').toLowerCase();
      if (TIPOS[kind].includes(tipo)) return true;

      return CATEGORIAS_DA_SECAO[kind].some((c) => temCategoria(movie, c));
    });
  }, [movies.data, search, categoria, kind, isKid]);

  return (
    <div className="container-app pt-24 pb-16">
      <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-white mb-2">
        {categoria || TITLES[kind]}
      </h1>
      <p className="mb-6 text-sm text-ink-400">
        {results.length} {results.length === 1 ? 'titulo' : 'titulos'}
      </p>

      <input
        placeholder="Buscar titulos..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-8 w-full max-w-xl rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-zinc-400 outline-none focus:border-brand-500"
      />

      {movies.isLoading ? (
        <FullScreenLoader label="Carregando catalogo..." />
      ) : results.length === 0 ? (
        <p className="text-ink-400">Nenhum titulo encontrado por aqui ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {results.map((movie: any) => (
            <PosterCard key={movie.id} title={movie} className="w-full" progress={progressByMovie[movie.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
