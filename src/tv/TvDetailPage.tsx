import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Heart, ArrowLeft, Star, Check } from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useCatalogWatchHistory } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import { useFavoriteByMovieId } from '@/hooks/useFavorite';
import { TvPosterCard } from './TvPosterCard';
import {
  formatDuration,
  formatYear,
  paraTvItem,
  ratingLabel,
  temporadasDe,
  type TvItem,
} from './tvUi';
import type { MediaType } from '@/types';
import { cn } from '@/lib/cn';

/**
 * TvDetailPage — detalhes do título na TV.
 *
 * Layout pensado para 16:9 e para o controle remoto: backdrop real + capa à
 * esquerda, informações à direita, e os dois botões principais (Assistir e
 * Minha Lista) como PRIMEIROS alvos do foco (data-tv-initial-focus).
 *
 * Para SÉRIES, o bloco de temporadas/episódios usa `episodes_available` — o
 * MESMO campo do catálogo que o site/Mobile usam (já filtrado por
 * disponibilidade de vídeo real). Cada episódio mostra o progresso real do
 * histórico do usuário (visto / em andamento) e leva direto ao player com
 * temporada e episódio na URL.
 */

export function TvDetailPage({ id: idProp }: { id?: string } = {}) {
  const { id: idParam } = useParams();
  const id = idProp ?? idParam;
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const historico = useCatalogWatchHistory();

  const movie = useMemo(
    () => (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null,
    [movies.data, id],
  );

  const item = useMemo<TvItem | null>(() => (movie ? paraTvItem(movie) : null), [movie]);

  const mediaType: MediaType = item?.type === 'series' ? 'tv' : 'movie';
  const fav = useFavoriteByMovieId(id ?? '', mediaType);

  const temporadas = useMemo(() => temporadasDe(movie?.episodes_available), [movie]);
  const [temporadaAtual, setTemporadaAtual] = useState<number | null>(null);

  // Seleciona a temporada da retomada (ou a primeira) quando a série carrega.
  useEffect(() => {
    if (temporadas.length === 0) return;
    setTemporadaAtual((atual) => (atual && temporadas.some((t) => t.numero === atual) ? atual : temporadas[0].numero));
  }, [temporadas]);

  /**
   * Progresso real por episódio ("T/E" → 0-100). Alimenta os marcadores
   * "Visto" / "Em andamento" na lista de episódios.
   */
  const progressoEpisodios = useMemo(() => {
    const map = new Map<string, number>();
    for (const { history: h, movie: m } of historico.items ?? []) {
      if (String(m.id) !== String(id)) continue;
      if (!h.season_number || !h.episode_number) continue;
      map.set(
        `${h.season_number}/${h.episode_number}`,
        h.duration_seconds > 0
          ? Math.min(100, Math.round((h.position_seconds / h.duration_seconds) * 100))
          : 0,
      );
    }
    return map;
  }, [historico.items, id]);

  const relacionados = useMemo<TvItem[]>(() => {
    if (!movie) return [];
    const cats = (movie.category || '').split(',').map((c) => c.trim()).filter(Boolean);
    return (movies.data ?? [])
      .filter((m) => m.id !== movie.id && cats.some((c) => (m.category || '').includes(c)))
      .slice(0, 30)
      .map(paraTvItem);
  }, [movies.data, movie]);

  const abrirPlayer = (temporada?: number, episodio?: number) => {
    if (!user || !assinante) {
      navigate('/tv/assinatura');
      return;
    }
    const qs = temporada && episodio ? `?temporada=${temporada}&episodio=${episodio}` : '';
    navigate(`/tv/assistir/${id}${qs}`);
  };

  if (movies.isLoading && !movies.data) {
    return (
      <div className="tv-page">
        <div className="tv-page-center">
          <div className="tv-loading">
            <div className="tv-loading-spinner" />
            <p>Carregando o título...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!item || !movie) {
    return (
      <div className="tv-page">
        <div className="tv-page-center">
          <div className="tv-error tv-error-muted">
            <h2>Título não encontrado</h2>
            <div className="tv-error-actions">
              <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-primary" onClick={() => navigate('/tv')}>
                Voltar ao início
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const categoria = (item.category || '').split(',').map((c) => c.trim()).filter(Boolean);
  const temporada = temporadas.find((t) => t.numero === temporadaAtual) ?? temporadas[0];

  return (
    <div className="tv-page tv-page-detail">
      {item.backdrop ? (
        <div className="tv-detail-backdrop" style={{ backgroundImage: `url(${item.backdrop})` }} />
      ) : null}
      <div className="tv-detail-overlay" />

      <div className="tv-detail-content">
        <div className="tv-detail-main">
          <div className="tv-detail-poster">
            {item.poster ? (
              <img src={item.poster} alt={item.title} />
            ) : (
              <div className="tv-card-placeholder">MF</div>
            )}
          </div>

          <div className="tv-detail-info">
            <div className="tv-hero-badges">
              <span className="tv-hero-badge tv-hero-badge-destaque">
                {item.type === 'series' ? 'Série' : 'Filme'}
              </span>
              {item.dublado ? <span className="tv-hero-badge tv-hero-badge-dublado">Dublado PT-BR</span> : null}
              {item.quality ? <span className="tv-hero-badge">{item.quality}</span> : null}
            </div>

            <h1 className="tv-detail-title">{item.title}</h1>

            <div className="tv-detail-meta">
              {item.vote && item.vote > 0 ? (
                <span className="tv-detail-rating">
                  <Star className="tv-icon tv-icon-sm" fill="currentColor" /> {ratingLabel(item.vote)}
                </span>
              ) : null}
              {formatYear(item.year) ? <span>{item.year}</span> : null}
              {item.duration ? <span>{formatDuration(item.duration)}</span> : null}
              {item.type === 'series' && temporadas.length > 0 ? (
                <span>
                  {temporadas.length} {temporadas.length === 1 ? 'temporada' : 'temporadas'}
                </span>
              ) : null}
            </div>

            {categoria.length > 0 ? <div className="tv-detail-cats">{categoria.join(' · ')}</div> : null}

            {item.description ? <p className="tv-detail-desc">{item.description}</p> : null}

            <div className="tv-detail-actions">
              <button
                data-tv-focusable
                data-tv-initial-focus
                tabIndex={0}
                className="tv-btn tv-btn-primary tv-btn-lg"
                onClick={() =>
                  abrirPlayer(
                    item.type === 'series' ? temporada?.numero : undefined,
                    item.type === 'series' ? temporada?.episodios[0]?.numero : undefined,
                  )
                }
              >
                <Play className="tv-icon" fill="currentColor" />
                {user && assinante ? 'Assistir' : 'Assinar para assistir'}
              </button>

              <button
                data-tv-focusable
                tabIndex={0}
                className={cn('tv-btn tv-btn-ghost tv-btn-lg', fav.isFavorite && 'tv-btn-ativo')}
                onClick={() => {
                  if (!user) {
                    // Login DENTRO da experiência de TV (nunca `/login` do site).
                    navigate('/tv/login');
                    return;
                  }
                  fav.toggle();
                }}
              >
                <Heart className="tv-icon" fill={fav.isFavorite ? 'currentColor' : 'none'} />
                {fav.isFavorite ? 'Na Minha Lista' : 'Minha Lista'}
              </button>

              <button
                data-tv-focusable
                tabIndex={0}
                className="tv-btn tv-btn-ghost tv-btn-lg"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="tv-icon" />
                Voltar
              </button>
            </div>

            {!user ? (
              <p className="tv-detail-warn">
                Entre na sua conta MovieFlix para assistir — a mesma conta do site e do aplicativo.
              </p>
            ) : !assinante ? (
              <p className="tv-detail-warn">
                Sua assinatura não está ativa. Escolha um plano em <strong>Planos</strong> para liberar a reprodução.
              </p>
            ) : null}
          </div>
        </div>

        {/* Temporadas e episódios — somente para séries, com dados reais. */}
        {item.type === 'series' ? (
          <section className="tv-section tv-seasons-block">
            <h2 className="tv-section-title">Episódios</h2>

            {temporadas.length === 0 ? (
              <p className="tv-detail-warn">
                Esta série ainda não tem episódios com fonte disponível no catálogo.
              </p>
            ) : (
              <>
                {temporadas.length > 1 ? (
                  <div className="tv-seasons">
                    {temporadas.map((t) => (
                      <button
                        key={t.numero}
                        data-tv-focusable
                        tabIndex={0}
                        className={cn('tv-chip', temporada?.numero === t.numero && 'tv-chip-ativo')}
                        onClick={() => setTemporadaAtual(t.numero)}
                      >
                        Temporada {t.numero}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="tv-episodes">
                  {(temporada?.episodios ?? []).map((ep) => {
                    const chave = ep.chave;
                    const prog = progressoEpisodios.get(chave) ?? 0;
                    const visto = prog >= 95;
                    return (
                      <button
                        key={chave}
                        data-tv-focusable
                        tabIndex={0}
                        className="tv-episode"
                        onClick={() => abrirPlayer(temporada!.numero, ep.numero)}
                      >
                        <span className="tv-episode-num">{ep.numero}</span>
                        <span>
                          Episódio {ep.numero}
                          {prog > 0 && !visto ? (
                            <span className="tv-episode-prog">
                              <span style={{ width: `${prog}%` }} />
                            </span>
                          ) : null}
                        </span>
                        {visto ? (
                          <span className="tv-episode-status tv-episode-status-ok">
                            <Check className="tv-icon-sm" style={{ width: '1.4vh', height: '1.4vh' }} /> Visto
                          </span>
                        ) : prog > 0 ? (
                          <span className="tv-episode-status">{prog}%</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        ) : null}

        {relacionados.length > 0 ? (
          <section className="tv-section">
            <h2 className="tv-section-title">Mais como este</h2>
            <div className="tv-row">
              {relacionados.map((rel) => (
                <div key={`${rel.type}-${rel.id}`} className="tv-row-slot">
                  <TvPosterCard item={rel} onAbrir={(i) => navigate(`/tv/titulo/${i.id}`)} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
