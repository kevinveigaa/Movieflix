import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Heart, ArrowLeft, Star, Clock } from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import { useFavoriteByMovieId } from '@/hooks/useFavorite';
import { TvPosterCard } from './TvPosterCard';
import { formatDuration, formatYear, ratingLabel, type TvItem } from './tvUi';
import type { MediaType } from '@/types';
import { cn } from '@/lib/cn';

/**
 * TvDetailPage — página de detalhes do título (TV).
 *
 * - Backdrop como fundo, capa à esquerda, informações à direita
 *   (título grande, ano, gênero, qualidade, duração, nota, descrição).
 * - Botão ASSISTIR recebe foco automático (após ~400ms).
 * - Botão Minha Lista (favorito) ao lado.
 * - Assinatura: se não ativa, o botão leva para /tv/assinatura
 *   (mesma regra de proteção do player: sem assinatura não assiste).
 * - "Mais como este" (mesma categoria) na parte inferior.
 */

export function TvDetailPage() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const [assistirFocado, setAssistirFocado] = useState(false);

  const movie = useMemo(() => {
    const all = movies.data ?? [];
    return all.find((m) => String(m.id) === String(id)) ?? null;
  }, [movies.data, id]);

  const mediaType: MediaType = type === 'serie' ? 'tv' : 'movie';
  const fav = useFavoriteByMovieId(id ?? '', mediaType);
  // Hook sempre chamado (regra dos hooks): só ativa quando tem id e user.
  const favResult = useMemo(
    () => (user && id ? fav : { isFavorite: false, toggle: () => undefined, loading: false }),
    [user, id, fav],
  );

  const relacionados = useMemo(() => {
    if (!movie) return [];
    const cats = (movie.category || '').split(',').map((c) => c.trim()).filter(Boolean);
    const all = (movies.data ?? []) as TvItem[];
    return all
      .filter((m) => m.id !== movie.id && cats.some((c) => (m.category || '').includes(c)))
      .slice(0, 12);
  }, [movies.data, movie]);

  // Foco automático no botão Assistir.
  useEffect(() => {
    if (!movie || assistirFocado) return;
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-tv-assistir]');
      if (el && document.activeElement !== el) {
        el.focus({ preventScroll: true });
        setAssistirFocado(true);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [movie, assistirFocado]);

  if (movies.isLoading && !movies.data) {
    return (
      <div className="tv-page">
        <div className="tv-loading">
          <div className="tv-loading-spinner" />
          <p>Carregando…</p>
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="tv-page">
        <div className="tv-error">
          <h2>Título não encontrado</h2>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/tv')}>
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  const item: TvItem = {
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
  };

  const abrirPlayer = () => {
    if (!assinante) {
      navigate('/tv/assinatura');
      return;
    }
    navigate(`/tv/assistir/${movie.id}`);
  };

  return (
    <div className="tv-page tv-page-detail">
      {/* Backdrop */}
      {item.backdrop ? (
        <div
          className="tv-detail-backdrop"
          style={{ backgroundImage: `url(${item.backdrop})` }}
        />
      ) : null}
      <div className="tv-detail-overlay" />

      <div className="tv-detail-content">
        <button
          data-tv-focusable
          tabIndex={0}
          className="tv-btn tv-btn-ghost tv-btn-back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="tv-icon" /> Voltar
        </button>

        <div className="tv-detail-main">
          <div className="tv-detail-poster">
            {item.poster ? <img src={item.poster} alt={item.title} /> : <div className="tv-card-placeholder">MF</div>}
          </div>

          <div className="tv-detail-info">
            <h1 className="tv-detail-title">{item.title}</h1>
            <div className="tv-detail-meta">
              {formatYear(item.year)}
              {item.quality ? ` · ${item.quality}` : ''}
              {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
              {item.vote && item.vote > 0 ? (
                <span className="tv-detail-rating">
                  <Star className="tv-icon tv-icon-sm" /> {ratingLabel(item.vote)}
                </span>
              ) : null}
            </div>
            {item.category ? <div className="tv-detail-cats">{item.category}</div> : null}
            {movie.description ? <p className="tv-detail-desc">{movie.description}</p> : null}

            <div className="tv-detail-actions">
              <button
                data-tv-assistir
                data-tv-focusable
                tabIndex={0}
                className="tv-btn tv-btn-primary tv-btn-lg"
                onClick={abrirPlayer}
              >
                <Play className="tv-icon" />
                {assinante ? 'Assistir' : 'Assinar para assistir'}
              </button>
              <button
                data-tv-focusable
                tabIndex={0}
                className={cn('tv-btn tv-btn-ghost tv-btn-lg', favResult.isFavorite && 'tv-btn-ativo')}
                onClick={() => favResult.toggle()}
              >
                <Heart className="tv-icon" fill={favResult.isFavorite ? 'currentColor' : 'none'} />
                {favResult.isFavorite ? 'Na Minha Lista' : 'Minha Lista'}
              </button>
            </div>

            {!user ? (
              <p className="tv-detail-warn">
                Faça login para assistir — entre pelo menu <strong>Site completo</strong> ou crie uma conta.
              </p>
            ) : !assinante ? (
              <p className="tv-detail-warn">
                Você precisa de uma assinatura ativa para assistir. Escolha um plano em Assinatura.
              </p>
            ) : null}
          </div>
        </div>

        {relacionados.length > 0 ? (
          <section className="tv-section">
            <h2 className="tv-section-title">Mais como este</h2>
            <div className="tv-row">
              {relacionados.map((rel, i) => (
                <TvPosterCard key={rel.id} item={rel} index={i} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
