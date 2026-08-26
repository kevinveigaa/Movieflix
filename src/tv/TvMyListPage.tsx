import { useNavigate } from 'react-router-dom';
import { useCatalogFavorites } from '@/hooks/useFavorite';
import { TvPosterCard } from './TvPosterCard';
import type { TvItem } from './tvUi';

/**
 * TvMyListPage — Minha Lista (favoritos) em grade para TV.
 * Reutiliza o hook de favoritos do site (mesma conta, mesma lista).
 */

export function TvMyListPage() {
  const navigate = useNavigate();
  const favs = useCatalogFavorites();

  if (favs.isLoading) {
    return (
      <div className="tv-page">
        <div className="tv-loading">
          <div className="tv-loading-spinner" />
          <p>Carregando sua lista…</p>
        </div>
      </div>
    );
  }

  const items: TvItem[] = (favs.items ?? []).map(({ movie }) => ({
    id: movie.id,
    title: movie.title,
    poster: movie.poster_url,
    backdrop: movie.backdrop_url,
    year: movie.year,
    quality: movie.quality,
    vote: movie.vote_average,
    category: movie.category,
    duration: movie.duration,
    type: movie.type === 'series' ? 'series' : 'movie',
  }));

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">Minha Lista</h1>
      {items.length === 0 ? (
        <div className="tv-error">
          <h2>Sua lista está vazia</h2>
          <p>Navegue pelo catálogo e adicione títulos à Minha Lista.</p>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/tv/filmes')}>
            Explorar filmes
          </button>
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
