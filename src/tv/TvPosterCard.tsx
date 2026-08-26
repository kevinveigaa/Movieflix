import { useNavigate } from 'react-router-dom';
import type { TvItem } from './tvUi';
import { formatDuration, formatYear, ratingLabel } from './tvUi';

/**
 * TvPosterCard — card grande de pôster para TV.
 * Área de clique grande (foco visível), título grande abaixo do pôster.
 * Navega para /tv/detalhe/:type/:id.
 */

export function TvPosterCard({ item, index }: { item: TvItem; index?: number }) {
  const navigate = useNavigate();
  const type = item.type === 'series' ? 'serie' : 'filme';

  return (
    <div
      data-tv-card
      data-tv-focusable
      tabIndex={0}
      className="tv-card"
      onClick={() => navigate(`/tv/detalhe/${type}/${item.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23) {
          e.preventDefault();
          navigate(`/tv/detalhe/${type}/${item.id}`);
        }
      }}
    >
      <div className="tv-card-poster">
        {item.poster ? (
          <img src={item.poster} alt={item.title} loading="lazy" />
        ) : (
          <div className="tv-card-placeholder">MF</div>
        )}
        {item.quality ? <span className="tv-card-quality">{item.quality}</span> : null}
        {item.vote && item.vote > 0 ? <span className="tv-card-rating">★ {ratingLabel(item.vote)}</span> : null}
        {index !== undefined ? (
          <span className="tv-card-index">{String(index + 1).padStart(2, '0')}</span>
        ) : null}
      </div>
      <div className="tv-card-title" title={item.title}>
        {item.title}
      </div>
      <div className="tv-card-meta">
        {formatYear(item.year)}
        {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
      </div>
    </div>
  );
}
