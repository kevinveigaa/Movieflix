import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { useMovies } from '@/hooks/useMovies';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { categoriasDoFilme, ehInfantil, temCategoria, isCategoriaKids } from '@/lib/categorias';

const TITLES: Record<string, string> = { filmes: 'Filmes', series: 'Séries', animes: 'Animes' };
const TIPOS: Record<string, string[]> = { filmes: ['movie'], series: ['series', 'serie', 'tv'], animes: ['anime'] };
const CATEGORIAS_DA_SECAO: Record<string, string[]> = { filmes: [], series: ['Serie', 'Novela'], animes: ['Anime'] };

const TODAS_CATEGORIAS = [
  'Ação','Aventura','Comédia','Drama','Terror','Ficção Científica','Romance',
  'Suspense','Fantasia','Animação','Infantil','Documentário','Crime','Mistério',
  'Guerra','Faroeste','História','Música','Família','Cinema TV','Novela','Clássicos','Nacional',
];

export function CatalogPage({ kind }: { kind: 'filmes' | 'series' | 'animes' }) {
  const movies = useMovies();
  const history = useWatchHistory();
  const { activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;
  const [searchParams] = useSearchParams();
  const categoriaParam = searchParams.get('categoria');

  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string>(categoriaParam || '');
  const [selectedYear, setSelectedYear] = useState('');
  const [minRating, setMinRating] = useState('');

  const progressByMovie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of history.data ?? []) {
      if (!h.movie_id) continue;
      const pct = h.duration_seconds ? Math.min(100, (h.position_seconds / h.duration_seconds) * 100) : 0;
      map[h.movie_id] = pct;
    }
    return map;
  }, [history.data]);

  const years = useMemo(() => {
    const ys = new Set<string>();
    (movies.data ?? []).forEach((m: any) => { if (m.year) ys.add(String(m.year)); });
    return Array.from(ys).sort((a, b) => b.localeCompare(a));
  }, [movies.data]);

  const results = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return (movies.data ?? []).filter((movie: any) => {
      if (isKid && !ehInfantil(movie)) return false;
      if (termo) {
        const campos = [movie.title, movie.description, movie.director, movie.cast, movie.category].join(' ').toLowerCase();
        if (!campos.includes(termo)) return false;
      }
      if (selectedGenre) {
        if (isCategoriaKids(selectedGenre)) return ehInfantil(movie);
        if (!temCategoria(movie, selectedGenre)) return false;
      }
      if (selectedYear && String(movie.year) !== selectedYear) return false;
      if (minRating && (movie.vote_average || 0) < Number(minRating)) return false;
      const tipo = String(movie.type ?? 'movie').toLowerCase();
      if (TIPOS[kind].includes(tipo)) return true;
      return CATEGORIAS_DA_SECAO[kind].some((c) => temCategoria(movie, c));
    });
  }, [movies.data, search, selectedGenre, selectedYear, minRating, kind, isKid]);

  const hasFilters = selectedGenre || selectedYear || minRating;

  return (
    <div className="container-app py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">{selectedGenre || TITLES[kind]}</h1>
          <p className="mt-1 text-sm text-ink-400">{results.length} {results.length === 1 ? 'título' : 'títulos'} encontrados</p>
        </div>
        <button onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10">
          <SlidersHorizontal className="h-4 w-4" /> Filtros {hasFilters && <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px]">!</span>}
        </button>
      </div>

      {/* Search bar */}
      <div className="relative mt-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título, ator, diretor, gênero..."
          className="w-full max-w-xl rounded-xl border border-white/10 bg-ink-800/60 pl-10 pr-4 py-3 text-sm text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none" />
      </div>

      {/* Filters */}
      {filtersOpen && (
        <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/50 p-4 animate-fade-in-up">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-300">Gênero</label>
              <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white">
                <option value="">Todos</option>
                {TODAS_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-300">Ano</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white">
                <option value="">Todos</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-300">Nota mínima</label>
              <select value={minRating} onChange={(e) => setMinRating(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white">
                <option value="">Qualquer</option>
                <option value="9">9+</option>
                <option value="8">8+</option>
                <option value="7">7+</option>
                <option value="6">6+</option>
                <option value="5">5+</option>
              </select>
            </div>
          </div>
          {hasFilters && (
            <button onClick={() => { setSelectedGenre(''); setSelectedYear(''); setMinRating(''); }}
              className="mt-3 flex items-center gap-1 text-xs text-red-400 transition hover:text-red-300">
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Results */}
      <div className="mt-8">
        {movies.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 14 }).map((_, i) => <PosterCardSkeleton key={i} />)}
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <Search className="h-12 w-12 text-ink-600" />
            <p className="text-ink-400">Nenhum título encontrado com esses filtros.</p>
            <button onClick={() => { setSearch(''); setSelectedGenre(''); setSelectedYear(''); setMinRating(''); }}
              className="btn-primary">Limpar filtros</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {results.map((movie: any) => (
              <PosterCard key={movie.id}
                title={{ id: movie.id, title: movie.title, description: movie.description, poster_url: movie.poster_url, backdrop_url: movie.backdrop_url, quality: movie.quality ?? 'HD', type: movie.type ?? 'movie', year: movie.year, vote_average: movie.vote_average, category: movie.category }}
                progress={progressByMovie[movie.id]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
