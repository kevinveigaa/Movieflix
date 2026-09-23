import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalogWatchHistory } from '@/hooks/useWatchHistory';
import { TvPosterCard } from './TvPosterCard';
import { dedupeContinuar, paraTvItem, type TvItem } from './tvUi';

/**
 * TvContinueWatchingPage — "Continuar assistindo" na TV.
 *
 * Usa `useCatalogWatchHistory()` — o MESMO histórico do site/Mobile (mesma
 * tabela `watch_history`, mesma conta, mesmo progresso).
 *
 * CORREÇÃO DA DUPLICAÇÃO: `dedupeContinuar` colapsa os registros por CONTEÚDO.
 * Antes, uma série com progresso em vários episódios aparecia repetida (o
 * mesmo cartaz várias vezes seguidas) porque o histórico grava uma linha por
 * episódio. Agora cada título aparece uma única vez, com o progresso real.
 */

export function TvContinueWatchingPage() {
  const navigate = useNavigate();
  const history = useCatalogWatchHistory();

  const itens = useMemo(() => {
    return dedupeContinuar(history.items ?? []).map(({ history: h, movie }) => ({
      item: paraTvItem(movie),
      progresso:
        h.duration_seconds > 0
          ? Math.min(100, Math.round((h.position_seconds / h.duration_seconds) * 100))
          : 0,
      episodio:
        h.season_number || h.episode_number
          ? `T${h.season_number ?? 1} · E${h.episode_number ?? 1}`
          : null,
    }));
  }, [history.items]);

  const assistir = (item: TvItem) => navigate(`/tv/assistir/${item.id}`);

  if (history.isLoading) {
    return (
      <div className="tv-page">
        <div className="tv-page-center">
          <div className="tv-loading">
            <div className="tv-loading-spinner" />
            <p>Carregando seu progresso...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">
        Continuar assistindo
        <span className="tv-section-count">({itens.length})</span>
      </h1>

      {itens.length === 0 ? (
        <div className="tv-error tv-error-muted">
          <h2>Nada em andamento</h2>
          <p>Quando você assistir a um título, ele aparece aqui para continuar de onde parou.</p>
          <div className="tv-error-actions">
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-primary" onClick={() => navigate('/tv')}>
              Ir para o início
            </button>
          </div>
        </div>
      ) : (
        <div className="tv-grid">
          {itens.map(({ item, progresso }) => (
            <TvPosterCard
              key={`${item.type}-${item.id}`}
              item={item}
              progress={progresso}
              onAbrir={assistir}
            />
          ))}
        </div>
      )}
    </div>
  );
}
