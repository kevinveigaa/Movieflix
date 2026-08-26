import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { useMovies } from '@/hooks/useMovies';
import { useFuzzySearch } from '@/hooks/useFuzzySearch';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useAuth } from '@/context/AuthContext';
import { ehInfantil } from '@/lib/categorias';
import { ehSerie } from '@/lib/media';

/**
 * Busca inteligente (fuzzy search) com Fuse.js — AUTOMÁTICA.
 *
 * Os resultados são recalculados a cada tecla (debounce de 250ms), sem
 * precisar apertar Enter/botão. A URL (/pesquisa?q=...) é apenas um
 * reflexo do termo, para permitir compartilhar/compartilhar o estado.
 *
 * Aceita escrita parcial ("vingad"), erro de letra ("vingadoes"), palavras
 * invertidas ("ultimato vingadores"), parte do título, título original em
 * inglês ("avengers"), título em pt-BR, gênero ("ação"), ano ("2019") e
 * busca em vários campos ao mesmo tempo. Ordena por RELEVÂNCIA (Fuse score),
 * com empate resolvido pela nota/popularidade.
 */
interface CatalogMovie {
  id: string;
  title?: string | null;
  category?: string | null;
  type?: string | null;
  year?: string | number | null;
  vote_average?: number | null;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const movies = useMovies();
  const { seriesHidden } = useSeriesHidden();
  const { activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;

  // Base do catálogo respeitando modo infantil e ocultação de séries.
  const base = (movies.data ?? []).filter((m: CatalogMovie) => {
    if (isKid && !ehInfantil(m)) return false;
    if (seriesHidden && ehSerie(m)) return false;
    return true;
  });

  const { termo, setTermo, results, resultsFallback, total, temBusca } = useFuzzySearch(
    base,
    initial,
  );

  // Espelha o termo digitado na URL (sem recarregar resultados — o debounce
  // interno do hook é quem dispara a busca).
  useEffect(() => {
    const t = setTimeout(() => {
      if (termo.trim()) setParams({ q: termo.trim() }, { replace: true });
      else setParams({}, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [termo, setParams]);

  const exibidos = results.length > 0 ? results : resultsFallback;

  return (
    <div className="container-app py-8">
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={seriesHidden ? 'Busque filmes...' : 'Busque filmes e séries...'}
            className="w-full rounded-full border border-white/10 bg-ink-800/70 py-3.5 pl-12 pr-12 text-base text-white placeholder:text-ink-400 focus:border-roxo-500 focus:outline-none"
          />
          {termo && (
            <button
              onClick={() => setTermo('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
              aria-label="Limpar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-8">
        {!temBusca ? (
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
        ) : exibidos.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-ink-400">
            <SearchIcon className="h-10 w-10 opacity-50" />
            <p>
              Nenhum título encontrado para <span className="text-white">{termo}</span>.
            </p>
            <p className="text-sm">Verifique a ortografia ou explore as categorias na página inicial.</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-400">
              {exibidos.length} {exibidos.length === 1 ? 'título' : 'títulos'} para{' '}
              <span className="text-white">{termo}</span>
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {exibidos.map((m: CatalogMovie) => (
                <PosterCard key={m.id} title={m} className="w-full" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
