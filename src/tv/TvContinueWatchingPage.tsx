import { useNavigate } from 'react-router-dom';
import { useCatalogWatchHistory } from '@/hooks/useWatchHistory';
import { TvPosterCard } from './TvPosterCard';
import { formatDuration } from './tvUi';
import type { TvItem } from './tvUi';

/**
 * TvContinueWatchingPage — "Continuar assistindo" em grade para TV.
 * Reutiliza o histórico do site (mesma conta, mesmo progresso).
 */

export function TvContinueWatchingPage() {
  const navigate = useNavigate();
  const history = useCatalogWatchHistory();

  if (history.isLoading) {
    return (
      <div className="tv-page">
        <div className="tv-loading">
          <div className="tv-loading-spinner" />
          <p>Carregando seu progresso…</p>
        </div>
      </div>
    );
  }

  const items: TvItem[] = (history.items ?? [])
    .filter((h) => h.movie)
    .slice(0, 60)
    .map((h) => ({
      id: h.movie!.id,
      title: h.movie!.title,
      poster: h.movie!.poster_url,
      backdrop: h.movie!.backdrop_url,
      year: h.movie!.year,
      quality: h.movie!.quality,
      vote: h.movie!.vote_average,
      category: h.movie!.category,
      duration: h.movie!.duration,
      type: h.movie!.type === 'series' ? 'series' : 'movie',
    }));

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">Continuar assistindo</h1>
      {items.length === 0 ? (
        <div className="tv-error">
          <h2>Nada em andamento</h2>
          <p>Quando você assistir um título, ele aparece aqui para continuar de onde parou.</p>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/tv')}>
            Explorar catálogo
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
