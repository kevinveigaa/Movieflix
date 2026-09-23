import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalogFavorites } from '@/hooks/useFavorite';
import { TvPosterCard } from './TvPosterCard';
import { paraTvItem, type TvItem } from './tvUi';

/**
 * TvMyListPage — Minha Lista (favoritos) na TV.
 *
 * Usa `useCatalogFavorites()` — o MESMO hook do site, lendo a MESMA tabela
 * `favorites` da MESMA conta. A TV não tem lista separada: favoritar na TV
 * aparece no site/Mobile e vice-versa.
 */

export function TvMyListPage() {
  const navigate = useNavigate();
  const favs = useCatalogFavorites();

  const items = useMemo<TvItem[]>(
    () => (favs.items ?? []).map(({ movie }) => paraTvItem(movie)),
    [favs.items],
  );

  const abrir = (item: TvItem) => navigate(`/tv/titulo/${item.id}`);

  if (favs.isLoading && items.length === 0) {
    return (
      <div className="tv-page">
        <div className="tv-page-center">
          <div className="tv-loading">
            <div className="tv-loading-spinner" />
            <p>Carregando sua lista...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">
        Minha Lista
        <span className="tv-section-count">({items.length})</span>
      </h1>

      {items.length === 0 ? (
        <div className="tv-error tv-error-muted">
          <h2>Sua lista está vazia</h2>
          <p>Abra um título e use “Minha Lista” para salvar. A mesma lista aparece no site e no app.</p>
          <div className="tv-error-actions">
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-primary" onClick={() => navigate('/tv/filmes')}>
              Explorar filmes
            </button>
          </div>
        </div>
      ) : (
        <div className="tv-grid">
          {items.map((item) => (
            <TvPosterCard key={`${item.type}-${item.id}`} item={item} onAbrir={abrir} />
          ))}
        </div>
      )}
    </div>
  );
}
