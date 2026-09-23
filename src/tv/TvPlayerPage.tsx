import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Maximize,
  Minimize,
  SkipForward,
  X,
  Loader2,
  AlertCircle,
  Pause,
  Play,
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
import { TvMark } from './TvBrand';
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV.
 *
 * REPRODUÇÃO: o embed OFICIAL do StreamBetter, montado em iframe — a MESMA
 * lógica do site e do app Mobile (`StreamBetterEmbed` + `src/lib/strembetter`).
 * É isso que evita o erro "Este link só funciona dentro de um iframe": o
 * provedor exige ser carregado DENTRO de um iframe, e é exatamente assim que
 * carregamos. A proteção contra popups/redirects/anúncios é o antiAds global
 * (`src/lib/antiAds.ts`), com Cloudflare/Turnstile preservados.
 *
 * ── PLAYER LIMPO (experiência de TV) ────────────────────────────────────────
 * Durante a reprodução NENHUMA barra fica sobre o vídeo. Os controles aparecem
 * quando o usuário aperta OK (ou uma tecla de mídia) e desaparecem sozinhos
 * depois de ~4s de inatividade. O vídeo ocupa a tela inteira — não há barra
 * fixa como na versão anterior.
 *
 * ── TECLAS DE MÍDIA DO CONTROLE REMOTO ──────────────────────────────────────
 * O shell Android (MainActivity) converte as teclas de mídia do controle no
 * evento `mf-media-key` e nós o escutamos:
 *   togglePlay → play/pause        next → próximo episódio (quando existe)
 *   seekFwd/seekBack → ±10s        stop → sai da reprodução
 * Essas ações são repassadas ao player embutido por `postMessage` (o canal
 * padrão de comunicação com o embed do provedor) e refletidas nos controles
 * desta tela. O provider continua sendo o dono da reprodução — não inventamos
 * um player paralelo.
 *
 * ── "PRÓXIMO EPISÓDIO" ──────────────────────────────────────────────────────
 * Só aparece para SÉRIE e SOMENTE quando existe um próximo episódio real com
 * fonte no catálogo (`episodes_available` ordenado). Em filme, nunca é mostrado.
 *
 * ── BACK ────────────────────────────────────────────────────────────────────
 * Hierarquia: 1º sai dos controles (se abertos) → 2º volta para os DETALHES.
 * Nunca fecha o app de surpresa.
 */

/** Tempo de inatividade antes de esconder os controles (ms). */
const AUTO_HIDE_MS = 4000;

export function TvPlayerPage({ id: idProp }: { id?: string } = {}) {
  const { id: idParam } = useParams();
  const id = idProp ?? idParam;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeWrapRef = useRef<HTMLDivElement>(null);
  const autoHideRef = useRef<number | null>(null);

  /** Controles visíveis (nunca ficam abertos durante a reprodução). */
  const [controles, setControles] = useState(false);
  /** Controle principal (play/pause) — recebe o foco quando a barra abre. */
  const ctrlMainRef = useRef<HTMLButtonElement>(null);
  /** Estado otimista de play/pause para o ícone do controle. */
  const [emReproducao, setEmReproducao] = useState(true);

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

      const atual = temPedido ? { season: pedida, episode: pedido } : primeiroEpisodioDisponivel(movie);
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
    if (movie) navigate(`/tv/titulo/${movie.id}`);
    else navigate('/tv');
  }, [movie, navigate]);

  const proximoEpisodio = useCallback(() => {
    if (!proximo || !movie) return;
    navigate(`/tv/assistir/${movie.id}?temporada=${proximo.season}&episodio=${proximo.episode}`);
  }, [proximo, movie, navigate]);

  /**
   * Envia um comando para o player embutido. Os embeds de provedor escutam
   * `postMessage` na janela do iframe; enviamos o formato genérico que os
   * players HTML5 (e o próprio StreamBetter) reconhecem, de forma tolerante.
   */
  const comandarPlayer = useCallback((acao: 'play' | 'pause' | 'toggle' | 'seekFwd' | 'seekBack') => {
    const iframe = iframeWrapRef.current?.querySelector('iframe');
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ event: 'command', func: acao, args: [] }, '*');
      iframe.contentWindow.postMessage({ type: 'mf-player-command', command: acao }, '*');
    } catch {
      /* o provedor pode não aceitar comandos externos — o embed tem controles próprios */
    }
  }, []);

  const alternarPlay = useCallback(() => {
    setEmReproducao((v) => {
      comandarPlayer(v ? 'pause' : 'play');
      return !v;
    });
  }, [comandarPlayer]);

  /**
   * Mostra os controles e (re)agenda o auto-hide.
   *
   * O foco vai para o controle principal (play/pause): sem isso o D-pad podia
   * cair em qualquer botão da barra — inclusive no de sair — e um OK "de
   * interação" acabava fechando o player (bug relatado).
   */
  const mostrarControles = useCallback(() => {
    setControles(true);
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    autoHideRef.current = window.setTimeout(() => setControles(false), AUTO_HIDE_MS);
    // Foco previsível: sempre no play/pause quando a barra abre.
    window.setTimeout(() => {
      try {
        ctrlMainRef.current?.focus({ preventScroll: true });
      } catch {
        /* o foco é opcional: a barra funciona mesmo sem ele */
      }
    }, 0);
  }, []);

  const esconderControles = useCallback(() => {
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    autoHideRef.current = null;
    setControles(false);
    // Devolve o foco à superfície do player (o D-pad continua aqui).
    try {
      frameRef.current?.focus({ preventScroll: true });
    } catch {
      /* ignora */
    }
  }, []);

  /**
   * BACK hierárquico do player. Fonte única da decisão (usada pela tecla e pela
   * camada nativa do Android TV):
   *   1º com os controles abertos  → fecha os controles e permanece no player;
   *   2º com os controles fechados → volta para os DETALHES.
   * Em nenhum caso fecha o app de surpresa.
   *
   * @returns true quando a pulsação foi consumida aqui.
   */
  const tratarVoltar = useCallback((): boolean => {
    if (controlesRef.current) {
      esconderControles();
      return true;
    }
    voltar();
    return true;
  }, [esconderControles, voltar]);

  // O estado dos controles precisa ser legível dentro de listeners antigos sem
  // recriá-los a cada mudança.
  const controlesRef = useRef(false);
  controlesRef.current = controles;

  // Informa a camada nativa (Android TV) se o BACK deve fechar os controles
  // antes de navegar — lido de forma SÍNCRONA pelo onBackPressed do shell.
  useEffect(() => {
    const ponte = (window as unknown as {
      MovieFlixAndroid?: { setControlesAbertos?: (v: boolean) => void };
    }).MovieFlixAndroid;
    try {
      ponte?.setControlesAbertos?.(controles);
    } catch {
      /* fora do app nativo: nada a fazer */
    }
  }, [controles]);

  // O shell nativo pede o fechamento dos controles (1ª pulsação de BACK).
  useEffect(() => {
    function fechar() {
      esconderControles();
    }
    window.addEventListener('mf-fechar-controles', fechar);
    return () => window.removeEventListener('mf-fechar-controles', fechar);
  }, [esconderControles]);

  useEffect(() => () => {
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
  }, []);

  /** Só faz sentido quando há assinante e fonte real de vídeo. */
  const pronto = Boolean(user) && assinante && Boolean(src);

  /**
   * Teclas de mídia do controle remoto (emitidas pelo shell Android como o
   * evento `mf-media-key`) + OK/BACK do player.
   */
  useEffect(() => {
    if (!pronto) return;

    function onMediaKey(e: Event) {
      const tipo = (e as CustomEvent<string>).detail;
      mostrarControles();
      if (tipo === 'togglePlay') alternarPlay();
      else if (tipo === 'next') {
        // Só troca de episódio quando existe próximo real (série).
        if (proximo) proximoEpisodio();
      } else if (tipo === 'stop') voltar();
      else if (tipo === 'seekFwd') comandarPlayer('seekFwd');
      else if (tipo === 'seekBack') comandarPlayer('seekBack');
    }

    function onKeyDown(e: KeyboardEvent) {
      const k = e.key;
      const c = e.keyCode || e.which;

      // OK / Enter (13, 23, 32): alterna os controles. Nunca sai do modo sozinho.
      const ehOk = k === 'Enter' || k === 'OK' || k === 'Select' || c === 13 || c === 23 || c === 32;
      // BACK (4 Tizen/Android TV, 8, 27, 461 webOS, 10009 Samsung).
      const ehBack = k === 'GoBack' || k === 'BrowserBack' || k === 'Escape' || k === 'Backspace'
        || c === 4 || c === 8 || c === 27 || c === 461 || c === 10009;

      if (ehOk) {
        e.preventDefault();
        e.stopPropagation();
        // BACK é hierárquico: 1º fecha os controles, depois sai.
        if (controles) alternarPlay();
        else mostrarControles();
        return;
      }

      if (ehBack) {
        // Hierarquia do player: fecha os controles (1ª) → volta aos detalhes (2ª).
        e.preventDefault();
        e.stopPropagation();
        tratarVoltar();
        return;
      }

      // Com os controles abertos, as setas laterais buscam ±10s.
      if (controles && (k === 'ArrowLeft' || c === 37 || c === 21)) {
        e.preventDefault();
        comandarPlayer('seekBack');
        mostrarControles();
      } else if (controles && (k === 'ArrowRight' || c === 39 || c === 22)) {
        e.preventDefault();
        comandarPlayer('seekFwd');
        mostrarControles();
      }
    }

    window.addEventListener('mf-media-key', onMediaKey as EventListener);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mf-media-key', onMediaKey as EventListener);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    pronto,
    controles,
    proximo,
    proximoEpisodio,
    voltar,
    alternarPlay,
    mostrarControles,
    esconderControles,
    comandarPlayer,
    tratarVoltar,
  ]);

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
              onClick={() => navigate('/tv/login')}
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
      {/* O vídeo ocupa a tela. Nenhuma barra fixa sobre ele. */}
      <div className="tv-player-box" data-tv-player-box ref={frameRef} tabIndex={0}>
        {/* O vídeo ocupa a tela inteira; nada fica sobre ele além da barra (quando aberta). */}
        <div ref={iframeWrapRef} className="tv-player-embed">
          {/* `mostrarTelaCheia={false}`: na TV o ÚNICO botão de tela cheia é o da
              barra de controles abaixo (alcançável pelo D-pad). O do embed
              aparecia como um SEGUNDO botão — o "botão duplicado" relatado —
              e ainda era inalcançável pelo controle remoto. */}
          <StreamBetterEmbed key={src} embedUrl={src} onBack={voltar} mostrarTelaCheia={false} />
        </div>

        {/* Superfície clicável: um OK mostra os controles (o iframe continua
            recebendo o foco do D-pad para o desafio de verificação). */}
        <button
          type="button"
          className={cn('tv-player-tap', controles && 'tv-player-tap-oculto')}
          aria-label="Mostrar controles"
          tabIndex={-1}
          onClick={mostrarControles}
        />
      </div>

      {/*
        Cabeçalho + controle: quando ESCONDIDOS ficam inalcançáveis pelo D-pad
        (`data-tv-hidden` remove todos de dentro da navegação espacial). Sem isso
        um OK "de interação" podia cair no botão de SAIR e fechar o player —
        era exatamente o bug relatado.
      */}
      <div
        className={cn('tv-player-overlay', controles && 'tv-player-overlay-ativo')}
        aria-hidden={!controles}
        data-tv-hidden={!controles || undefined}
      >
        <div className="tv-player-top">
          {/* Símbolo "M" da marca — nunca a palavra MOVIEFLIX escrita. */}
          <TvMark className="tv-player-logo" />
          <div>
            <div className="tv-player-title">{movie.title}</div>
            {epLabel ? <div className="tv-player-sub">Episódio {epLabel}</div> : null}
          </div>
        </div>

        <div className="tv-player-controls">
          <button
            data-tv-focusable
            tabIndex={controles ? 0 : -1}
            className="tv-player-ctrl"
            aria-label="Voltar"
            onClick={voltar}
          >
            <ArrowLeft className="tv-player-ctrl-icon" />
          </button>

          <button
            ref={ctrlMainRef}
            data-tv-focusable
            tabIndex={controles ? 0 : -1}
            className="tv-player-ctrl tv-player-ctrl-main"
            aria-label={emReproducao ? 'Pausar' : 'Reproduzir'}
            onClick={alternarPlay}
          >
            {emReproducao ? (
              <Pause className="tv-player-ctrl-icon" fill="currentColor" />
            ) : (
              <Play className="tv-player-ctrl-icon" fill="currentColor" />
            )}
          </button>

          {/* Próximo episódio: SÓ para série e SÓ quando existe próximo real. */}
          {ehSerie && proximo ? (
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Próximo episódio"
              onClick={proximoEpisodio}
            >
              <SkipForward className="tv-player-ctrl-icon" fill="currentColor" />
            </button>
          ) : null}

          <button
            data-tv-focusable
            tabIndex={controles ? 0 : -1}
            className="tv-player-ctrl"
            aria-label="Tela cheia"
            onClick={() => {
              const el = frameRef.current;
              if (!el) return;
              if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
              else el.requestFullscreen?.().catch(() => undefined);
            }}
          >
            {typeof document !== 'undefined' && document.fullscreenElement ? (
              <Minimize className="tv-player-ctrl-icon" />
            ) : (
              <Maximize className="tv-player-ctrl-icon" />
            )}
          </button>

          {/* Botão "Sair" explícito. (O antigo botão "Informações" chamava
              voltar() — um controle que fechava o player era justamente o que
              não podia existir.) */}
          <button
            data-tv-focusable
            tabIndex={controles ? 0 : -1}
            className="tv-player-ctrl"
            aria-label="Sair da reprodução"
            onClick={voltar}
          >
            <X className="tv-player-ctrl-icon" />
          </button>
        </div>

        <p className="tv-player-dica">
          OK mostra os controles · BACK fecha os controles e depois volta aos detalhes
        </p>
      </div>
    </div>
  );
}
