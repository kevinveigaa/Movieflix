import { useMemo, useState } from 'react';
import { useMovies } from '@/hooks/useMovies';
import { TvPosterCard } from './TvPosterCard';
import { cn } from '@/lib/cn';
import type { TvItem } from './tvUi';

/**
 * TvCatalogPage — grid de catálogo (Filmes / Séries) em grade 6×N.
 *
 * - Filtro superior por categoria (linha de chips navegável ← →).
 * - Ordenação: Recentes / Populares / A-Z / Z-A.
 * - Grade com data-tv-focusable: o useTvNavigation resolve ↑↓←→
 *   espacialmente (a grade é a área principal de navegação).
 */

type SortMode = 'recentes' | 'populares' | 'az' | 'za';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'recentes', label: 'Recentes' },
  { id: 'populares', label: 'Populares' },
  { id: 'az', label: 'A-Z' },
  { id: 'za', label: 'Z-A' },
];

export function TvCatalogPage({ mode }: { mode: 'movie' | 'series' }) {
  const movies = useMovies(mode === 'movie' ? 'movie' : 'tv');
  const [cat, setCat] = useState<string>('Todas');
  const [sort, setSort] = useState<SortMode>('recentes');

  const all = useMemo(() => (movies.data ?? []) as TvItem[], [movies.data]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    for (const m of all) {
      for (const c of (m.category || '').split(',')) {
        const t = c.trim();
        if (t) set.add(t);
      }
    }
    return ['Todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [all]);

  const items = useMemo(() => {
    let list = all;
    if (cat !== 'Todas') list = list.filter((m) => (m.category || '').split(',').map((c) => c.trim()).includes(cat));
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

  if (movies.isLoading && !movies.data) {
    return (
      <div className="tv-page">
        <div className="tv-loading">
          <div className="tv-loading-spinner" />
          <p>Carregando {mode === 'movie' ? 'filmes' : 'séries'}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">{mode === 'movie' ? 'Filmes' : 'Séries'}</h1>

      {/* Filtro de categoria */}
      <div className="tv-chips">
        {cats.map((c) => (
          <button
            key={c}
            data-tv-focusable
            tabIndex={0}
            className={cn('tv-chip', cat === c && 'tv-chip-ativo')}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Ordenação */}
      <div className="tv-chips">
        {SORTS.map((s) => (
          <button
            key={s.id}
            data-tv-focusable
            tabIndex={0}
            className={cn('tv-chip', sort === s.id && 'tv-chip-ativo')}
            onClick={() => setSort(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="tv-error">
          <h2>Nada encontrado</h2>
          <p>Nenhum título nessa categoria.</p>
        </div>
      ) : (
        <div className="tv-grid">
          {items.map((item, i) => (
            <TvPosterCard key={item.id} item={item} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
