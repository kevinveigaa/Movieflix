import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMovies } from '@/hooks/useMovies';
import { TvPosterCard } from './TvPosterCard';
import { cn } from '@/lib/cn';
import { categoriasDe, chunk, paraTvItem, type TvItem } from './tvUi';

/**
 * TvCatalogPage — grade de catálogo (Filmes / Séries).
 *
 * Dados: `useMovies('movie' | 'tv')` — a MESMA fonte do site e do app Mobile.
 * Nada de JSON paralelo da TV.
 *
 * PERFORMANCE (correção do catálogo que não aparecia): o catálogo real tem
 * ~18 mil filmes. Renderizar todos os cards de uma vez travava a UI da TV.
 * Aqui a grade é renderizada em BLOCOS (60 por vez) e o usuário (controle na
 * mão) carrega o próximo bloco quando quiser.
 */

type SortMode = 'recentes' | 'populares' | 'az' | 'za';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'recentes', label: 'Recentes' },
  { id: 'populares', label: 'Populares' },
  { id: 'az', label: 'A-Z' },
  { id: 'za', label: 'Z-A' },
];

const POR_BLOCO = 60;

export function TvCatalogPage({ mode }: { mode: 'movie' | 'series' }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const movies = useMovies(mode === 'movie' ? 'movie' : 'tv');
  const [sort, setSort] = useState<SortMode>(mode === 'movie' ? 'recentes' : 'populares');
  const [blocos, setBlocos] = useState(1);

  const cat = params.get('categoria') ?? 'Todas';

  /** Mapeamento do catálogo real para o modelo da UI (mesmos campos do site). */
  const all = useMemo<TvItem[]>(
    () => (movies.data ?? []).map(paraTvItem),
    [movies.data],
  );

  const cats = useMemo(() => ['Todas', ...categoriasDe(all)], [all]);

  const items = useMemo(() => {
    let list = all;
    if (cat !== 'Todas') {
      list = list.filter((m) =>
        (m.category || '')
          .split(',')
          .map((c) => c.trim())
          .includes(cat),
      );
    }
    switch (sort) {
      case 'recentes':
        return [...list].sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
      case 'populares':
        return [...list].sort((a, b) => (b.vote ?? 0) - (a.vote ?? 0));
      case 'az':
        return [...list].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
      case 'za':
        return [...list].sort((a, b) => b.title.localeCompare(a.title, 'pt-BR'));
    }
  }, [all, cat, sort]);

  const visiveis = useMemo(() => chunk(items, POR_BLOCO).slice(0, blocos).flat(), [items, blocos]);
  const temMais = visiveis.length < items.length;

  const abrir = (item: TvItem) => navigate(`/tv/titulo/${item.id}`);
  const trocarCat = (c: string) => {
    setBlocos(1);
    if (c === 'Todas') setParams({});
    else setParams({ categoria: c });
  };

  if (movies.isLoading && !movies.data) {
    return (
      <div className="tv-page">
        <div className="tv-page-center">
          <div className="tv-loading">
            <div className="tv-loading-spinner" />
            <p>Carregando {mode === 'movie' ? 'filmes' : 'séries'} do catálogo MovieFlix...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">
        {mode === 'movie' ? 'Filmes' : 'Séries'}
        <span className="tv-section-count">({items.length})</span>
      </h1>

      {/* Categorias (dados reais do catálogo). */}
      <div className="tv-chips">
        {cats.map((c) => (
          <button
            key={c}
            data-tv-focusable
            tabIndex={0}
            className={cn('tv-chip', cat === c && 'tv-chip-ativo')}
            onClick={() => trocarCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Ordenação. */}
      <div className="tv-chips">
        {SORTS.map((s) => (
          <button
            key={s.id}
            data-tv-focusable
            tabIndex={0}
            className={cn('tv-chip', sort === s.id && 'tv-chip-ativo')}
            onClick={() => {
              setBlocos(1);
              setSort(s.id);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="tv-error tv-error-muted">
          <h2>Nada encontrado</h2>
          <p>Nenhum título nessa categoria.</p>
        </div>
      ) : (
        <>
          <div className="tv-grid">
            {visiveis.map((item) => (
              <TvPosterCard key={`${item.type}-${item.id}`} item={item} onAbrir={abrir} />
            ))}
          </div>

          {temMais ? (
            <div className="tv-load-more">
              <button
                data-tv-focusable
                tabIndex={0}
                className="tv-btn tv-btn-ghost"
                onClick={() => setBlocos((b) => b + 1)}
              >
                Carregar mais ({visiveis.length} de {items.length})
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
