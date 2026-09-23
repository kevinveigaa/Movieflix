import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Maximize,
  Minimize,
  SkipForward,
  Gamepad2,
  Info,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import {
  primeiroEpisodioDisponivel,
  streambetterMovieEmbedUrl,
  streambetterSeriesEmbedUrl,
} from '@/lib/strembetter';
import { StreamBetterEmbed } from '@/components/player/StreamBetterEmbed';
import { useTvPlayerControls } from '@/hooks/useTvPlayerControls';
import { TvMark } from './TvBrand';
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV.
 *
 * REPRODUÇÃO: o embed OFICIAL do StreamBetter, montado em iframe — a MESMA
 * lógica do site e do app Mobile (`StreamBetterEmbed` + `src/lib/streamEmbed`).
 * É isso que evita o erro "Este link só funciona dentro de um iframe": o
 * provedor exige ser carregado DENTRO de um iframe, e é exatamente assim que
 * carregamos. A proteção contra popups/redirects/anúncios é o antiAds global
 * (`src/lib/antiAds.ts`), com os domínios de verificação Cloudflare/Turnstile
 * preservados.
 *
 * EXPERIÊNCIA DE TV (controles ocultos durante a reprodução):
 *  - Ao abrir, o vídeo ocupa a tela e NENHUMA barra de controles fica por cima.
 *  - BACK: o primeiro toque sai dos controles; só sai da reprodução se os
 *    controles já estiverem fechados (nunca fecha o app de surpresa).
 *  - SEGURAR OK (~1s) com o foco no player alterna o MODO CONTROLE DO PLAYER
 *    (setas passam a operar o vídeo). Segurar OK de novo sai — implementado em
 *    `useTvPlayerControls`, que conhece os keyCodes de Android TV / Tizen /
 *    webOS.
 *
 * "PRÓXIMO EPISÓDIO" só aparece para SÉRIE e SOMENTE quando existe um próximo
 * episódio de verdade com fonte no catálogo (`episodes_available` + a lista
 * ordenada) — em filme, o controle nunca é mostrado.
 */

export function TvPlayerPage({ id: idProp }: { id?: string } = {}) {
  const { id: idParam } = useParams();
  const id = idProp ?? idParam;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const frameRef = useRef<HTMLDivElement>(null);
  const [playerMode, setPlayerMode] = useState(false);

  const movie = useMemo(
    () => (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null,
    [movies.data, id],
  );

  const ehSerie = Boolean(
    movie && (movie.type === 'series' || movie.type === 'serie' || movie.type === 'tv' || movie.media_type === 'tv'),
  );

  /**
   * Fonte da reprodução. Para SÉRIE usa a temporada/episódio pedidos na URL
   * (ou o primeiro episódio real com fonte); para FILME, o tmdb_id.
   * Fontes: as MESMAS do site/Mobile — nenhum vídeo fictício.
   */
  const { src, proximo } = useMemo(() => {
    if (!movie) return { src: '', proximo: null as { season: number; episode: number } | null };

    if (ehSerie && movie.tmdb_id) {
      const eps = movie.episodes_available ?? [];
      const pedida = Number(params.get('temporada'));
      const pedido = Number(params.get('episodio'));
      const temPedido = Number.isFinite(pedida) && pedida > 0 && Number.isFinite(pedido) && pedido > 0;

      const ordenados = eps
        .map((e) => {
          const [s, ep] = String(e).split('/');
          const season = Number(s);
          const episode = Number(ep);
          return Number.isFinite(season) && Number.isFinite(episode) ? { season, episode } : null;
        })
        .filter((x): x is { season: number; episode: number } => x !== null)
        .sort((a, b) => a.season - b.season || a.episode - b.episode);

      const atual = temPedido
        ? { season: pedida, episode: pedido }
        : primeiroEpisodioDisponivel(movie);

      if (!atual) return { src: '', proximo: null };

      const idx = ordenados.findIndex((e) => e.season === atual.season && e.episode === atual.episode);
      const prox = idx >= 0 && idx + 1 < ordenados.length ? ordenados[idx + 1] : null;

      return {
        src: streambetterSeriesEmbedUrl(movie.tmdb_id, atual.season, atual.episode),
        proximo: prox,
      };
    }

    if (movie.tmdb_id) return { src: streambetterMovieEmbedUrl(movie.tmdb_id), proximo: null };
    if (movie.video_url) return { src: movie.video_url, proximo: null };
    return { src: '', proximo: null };
  }, [movie, ehSerie, params]);

  const voltar = useCallback(() => {
    // Volta para os DETALHES (o player é sempre aberto a partir deles).
    if (movie) navigate(`/tv/titulo/${movie.id}`);
    else navigate('/tv');
  }, [movie, navigate]);

  // Controles do player por controle remoto (Back da página + long-press OK).
  useTvPlayerControls(
    Boolean(user) && assinante && Boolean(src),
    playerMode,
    frameRef,
    voltar,
  );

  // Sincroniza o badge com o evento do hook (long-press OK).
  useEffect(() => {
    function onChange() {
      setPlayerMode(document.documentElement.classList.contains('tv-in-player'));
    }
    window.addEventListener('mf-player-mode-change', onChange);
    return () => window.removeEventListener('mf-player-mode-change', onChange);
  }, []);

  const proximoEpisodio = useCallback(() => {
    if (!proximo || !movie) return;
    navigate(`/tv/assistir/${movie.id}?temporada=${proximo.season}&episodio=${proximo.episode}`);
  }, [proximo, movie, navigate]);

  // Aviso do episódio atual (só em série).
  const epLabel = ehSerie
    ? `T${Number(params.get('temporada')) || primeiroEpisodioDisponivel(movie)?.season || 1} · E${
        Number(params.get('episodio')) || primeiroEpisodioDisponivel(movie)?.episode || 1
      }`
    : null;

  if (authLoading) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-loading">
          <Loader2 className="tv-icon tv-spin" />
          <p>Verificando seu acesso...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error">
          <AlertCircle className="tv-icon-lg" style={{ color: '#df0a15' }} />
          <h2>Faça login para assistir</h2>
          <p>Use a mesma conta MovieFlix do site e do aplicativo.</p>
          <div className="tv-error-actions">
            <button
              data-tv-focusable
              data-tv-initial-focus
              tabIndex={0}
              className="tv-btn tv-btn-primary"
              onClick={() => navigate('/login')}
            >
              Entrar na minha conta
            </button>
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!assinante) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error">
          <AlertCircle className="tv-icon-lg" style={{ color: '#df0a15' }} />
          <h2>Assinatura necessária</h2>
          <p>Sua assinatura não está ativa. Escolha um plano para liberar a reprodução.</p>
          <div className="tv-error-actions">
            <button
              data-tv-focusable
              data-tv-initial-focus
              tabIndex={0}
              className="tv-btn tv-btn-primary"
              onClick={() => navigate('/tv/assinatura')}
            >
              Ver planos
            </button>
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!movie || !src) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error tv-error-muted">
          <h2>Não foi possível carregar o conteúdo</h2>
          <p>Este título não tem fonte de vídeo disponível no catálogo.</p>
          <div className="tv-error-actions">
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page tv-page-player">
      <div className="tv-player-box" data-tv-player-box ref={frameRef} tabIndex={0}>
        <StreamBetterEmbed key={src} embedUrl={src} onBack={voltar} />
      </div>

      {/* Barra de topo discreta: marca + título do conteúdo. */}
      <div className="tv-player-top">
        <TvMark className="tv-player-logo" />
        <div>
          <div className="tv-player-title">{movie.title}</div>
          {epLabel ? <div className="tv-player-sub">Episódio {epLabel}</div> : null}
        </div>
      </div>

      {/* Controles: aparecem só quando chamados, nunca cobrindo o vídeo. */}
      <div className="tv-player-controls">
        <button
          data-tv-focusable
          tabIndex={0}
          className="tv-player-ctrl"
          aria-label="Voltar"
          onClick={voltar}
        >
          <ArrowLeft className="tv-player-ctrl-icon" />
        </button>

        {/* Próximo episódio: só para SÉRIE e só quando existe próximo real. */}
        {proximo ? (
          <button
            data-tv-focusable
            tabIndex={0}
            className="tv-player-ctrl tv-player-ctrl-main"
            aria-label="Próximo episódio"
            onClick={proximoEpisodio}
          >
            <SkipForward className="tv-player-ctrl-icon" fill="currentColor" />
          </button>
        ) : null}

        <button
          data-tv-focusable
          tabIndex={0}
          className="tv-player-ctrl"
          aria-label="Tela cheia"
          onClick={() => {
            const el = frameRef.current;
            if (!el) return;
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => undefined);
            } else {
              el.requestFullscreen?.().catch(() => undefined);
            }
          }}
        >
          {typeof document !== 'undefined' && document.fullscreenElement ? (
            <Minimize className="tv-player-ctrl-icon" />
          ) : (
            <Maximize className="tv-player-ctrl-icon" />
          )}
        </button>

        <button
          data-tv-focusable
          tabIndex={0}
          className="tv-player-ctrl"
          aria-label="Informações"
          onClick={voltar}
        >
          <Info className="tv-player-ctrl-icon" />
        </button>
      </div>

      {/* Dica de controle remoto (a reprodução é do provedor StreamBetter). */}
      <div className={cn('tv-player-mode-badge', playerMode && 'tv-player-mode-ativo')} data-tv-player-mode>
        <Gamepad2 className="tv-icon-sm" style={{ width: '1.5vh', height: '1.5vh' }} />
        {playerMode
          ? 'CONTROLE DO PLAYER - as setas controlam o vídeo. Segure OK para sair.'
          : 'Segure OK no vídeo para controlar a reprodução. BACK volta.'}
      </div>
    </div>
  );
}
