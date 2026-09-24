import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  SkipForward,
  X,
  Loader2,
  AlertCircle,
  Pause,
  Play,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
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
import {
  ajustarVolume,
  definirMudo,
  lerMudo,
  lerVolume,
  volumeNativoDisponivel,
} from '@/lib/volumeTv';
import { enviarComandoPlayer, type AcaoPlayer } from '@/lib/playerCommands';
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
 * ── O QUE FOI CORRIGIDO NESTA VERSÃO (relato do usuário) ─────────────────────
 *  a) NÃO HÁ MAIS BOTÕES SOLTOS NO TOPO. A versão anterior desenhava uma barra
 *     de topo sobre o vídeo (marca + título) e a barra de controles embaixo —
 *     duas superfícies concorrentes na tela. Agora existe UMA barra única, no
 *     rodapé, com o título discreto à esquerda e os controles à direita. Nada
 *     fica solto sobre o vídeo.
 *  b) SEEK PELO CONTROLE: ← retrocede 10s e → avança 10s, com o passo à vista.
 *     Funciona com o foco no player (controles fechados), que é o estado normal
 *     durante a reprodução. Também há os botões ⟲ / ⟳ na barra.
 *  c) CONFIGURAÇÕES DO PLAYER pelo controle: ↑ (controles fechados) ou o botão
 *     de engrenagem abrem o painel, navegável só com o D-pad.
 *  d) VOLUME pelo controle: as teclas +/− do controle aumentam/diminuem e 🔇
 *     muta/desmuta. O ajuste vai pelo AudioManager do aparelho (ponte nativa),
 *     porque o vídeo vive num iframe de OUTRA origem — mexer em `video.volume`
 *     ali dentro é impossível e um botão assim seria decorativo. Com um player
 *     HLS NATIVO do MovieFlix, o volume cai no `<video>` direto.
 *  e) SEM BORDA VERMELHA ao redor do vídeo (a regra de CSS do foco foi
 *     removida). O indicador de foco agora é discreto e vive na barra.
 *  f) TUDO ACIONADO PELO CONTROLE DENTRO DO APP: o shell Android repassa as
 *     teclas de mídia como `mf-media-key` e as de D-pad como keydown normal;
 *     ambos os caminhos estão tratados aqui.
 *
 * ── HIERARQUIA DO BACK (nunca fecha o app de surpresa) ───────────────────────
 *  1º painel de configurações aberto  → fecha o painel;
 *  2º controles abertos               → fecha os controles;
 *  3º volta para os DETALHES do título.
 */

/** Tempo de inatividade antes de esconder os controles (ms). */
const AUTO_HIDE_MS = 4000;

/** Passo do seek pelo controle remoto, em segundos. */
const PASSO_SEEK = 10;

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

  /** Controles visíveis (nunca ficam abertos durante a reprodução, salvo pin). */
  const [controles, setControles] = useState(false);
  /** Controles PINADOS (segurar OK): não somem sozinhos. */
  const [fixo, setFixo] = useState(false);
  /** Painel de configurações do player aberto? */
  const [config, setConfig] = useState(false);
  /** Controle principal (play/pause) — recebe o foco quando a barra abre. */
  const ctrlMainRef = useRef<HTMLButtonElement>(null);
  /** Estado otimista de play/pause para o ícone do controle. */
  const [emReproducao, setEmReproducao] = useState(true);
  /** Recria o embed ("Recarregar player") sem duplicar iframes. */
  const [recarga, setRecarga] = useState(0);

  /** Volume da mídia do aparelho (0–100) e mudo — lidos da ponte nativa. */
  const [volume, setVolume] = useState<number>(() => lerVolume() ?? 50);
  const [mudo, setMudo] = useState<boolean>(() => lerMudo() ?? false);
  /** O aparelho expõe o volume da mídia ao site? (independe do navegador) */
  const temVolume = volumeNativoDisponivel() || typeof lerVolume() === 'number';
  /** Aviso curto sobreposto (feedback de volume/seek/sem volume). */
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoRef = useRef<number | null>(null);

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

  /** Mostra um aviso curto sobreposto (feedback das ações do controle). */
  const mostrarAviso = useCallback((texto: string) => {
    setAviso(texto);
    if (avisoRef.current !== null) window.clearTimeout(avisoRef.current);
    avisoRef.current = window.setTimeout(() => setAviso(null), 1400);
  }, []);

  /**
   * Envia um comando para o player embutido.
   *
   * A lógica (quais nomes de comando o player reconhece, e o reforço no vídeo
   * nativo) vive em `@/lib/playerCommands`, junto com a explicação da CAUSA
   * RAIZ do bug de seek — mantida num módulo puro para poder ser verificada.
   *
   * HONESTIDADE: um embed de outra origem pode recusar comandos externos por
   * segurança. Nesse caso o embed mantém os controles próprios, e o volume
   * segue resolvido pelo áudio do APARELHO (funciona em qualquer provedor).
   */
  const comandarPlayer = useCallback((acao: AcaoPlayer) => {
    const iframe = iframeWrapRef.current?.querySelector('iframe');
    enviarComandoPlayer(iframe, acao, PASSO_SEEK);
  }, []);

  const alternarPlay = useCallback(() => {
    setEmReproducao((v) => {
      comandarPlayer(v ? 'pause' : 'play');
      return !v;
    });
  }, [comandarPlayer]);

  /** Seek pelo controle: avança/retrocede e mostra o passo no aviso. */
  const seek = useCallback(
    (frente: boolean) => {
      comandarPlayer(frente ? 'seekFwd' : 'seekBack');
      mostrarAviso(frente ? `⏩ +${PASSO_SEEK}s` : `⏪ −${PASSO_SEEK}s`);
    },
    [comandarPlayer, mostrarAviso],
  );

  /** Volume pelo controle (áudio do aparelho pela ponte nativa). */
  const mudarVolume = useCallback(
    (delta: number) => {
      const ok = ajustarVolume(delta);
      if (!ok) {
        mostrarAviso('Volume indisponível — use o volume da TV');
        return;
      }
      const novo = lerVolume();
      if (typeof novo === 'number') setVolume(novo);
      else setVolume((v) => Math.min(100, Math.max(0, v + delta)));
      const m = lerMudo();
      if (typeof m === 'boolean') setMudo(m);
      mostrarAviso(delta > 0 ? `🔊 ${typeof novo === 'number' ? novo : 'Volume'}%` : `🔉 Volume`);
    },
    [mostrarAviso],
  );

  const alternarMudo = useCallback(() => {
    const alvo = !mudo;
    if (!definirMudo(alvo)) {
      mostrarAviso('Mudo indisponível — use o volume da TV');
      return;
    }
    setMudo(alvo);
    mostrarAviso(alvo ? '🔇 Mudo' : '🔊 Som');
  }, [mudo, mostrarAviso]);

  /**
   * Mostra os controles e (re)agenda o auto-hide.
   *
   * O foco vai para o controle principal (play/pause): sem isso o D-pad podia
   * cair em qualquer botão da barra — inclusive no de sair — e um OK "de
   * interação" acabava fechando o player.
   */
  const mostrarControles = useCallback(() => {
    setControles(true);
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    autoHideRef.current = window.setTimeout(() => setControles(false), AUTO_HIDE_MS);
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
    setFixo(false);
    document.documentElement.classList.remove('tv-in-player');
    // Devolve o foco à superfície do player (o D-pad continua aqui).
    try {
      frameRef.current?.focus({ preventScroll: true });
    } catch {
      /* ignora */
    }
  }, []);

  const abrirConfig = useCallback(() => {
    setConfig(true);
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    setControles(true);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>('[data-tv-config-panel] [data-tv-focusable]')?.focus({
        preventScroll: true,
      });
    }, 30);
  }, []);

  const fecharConfig = useCallback(() => {
    setConfig(false);
    try {
      frameRef.current?.focus({ preventScroll: true });
    } catch {
      /* ignora */
    }
  }, []);

  /**
   * BACK hierárquico do player. Fonte única da decisão:
   *   1º painel de configurações → fecha o painel;
   *   2º controles abertos       → fecha os controles;
   *   3º volta para os DETALHES.
   * Em nenhum caso fecha o app de surpresa.
   */
  const tratarVoltar = useCallback((): boolean => {
    if (config) {
      fecharConfig();
      return true;
    }
    if (controles) {
      esconderControles();
      return true;
    }
    voltar();
    return true;
  }, [config, fecharConfig, controles, esconderControles, voltar]);

  // O estado precisa ser legível dentro de listeners sem recriá-los a cada mudança.
  const estadosRef = useRef({ controles, fixo, config });
  estadosRef.current = { controles, fixo, config };

  // Informa a camada nativa (Android TV) se o BACK deve fechar algo antes de
  // navegar — lido de forma SÍNCRONA pelo onBackPressed do shell.
  useEffect(() => {
    const ponte = (window as unknown as {
      MovieFlixAndroid?: { setControlesAbertos?: (v: boolean) => void };
    }).MovieFlixAndroid;
    try {
      ponte?.setControlesAbertos?.(controles || config);
    } catch {
      /* fora do app nativo: nada a fazer */
    }
  }, [controles, config]);

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
    if (avisoRef.current !== null) window.clearTimeout(avisoRef.current);
  }, []);

  /** Só faz sentido quando há assinante e fonte real de vídeo. */
  const pronto = Boolean(user) && assinante && Boolean(src);

  /**
   * CONTROLES PELO CONTROLE REMOTO.
   *
   * Dois contextos, sem ambiguidade:
   *  • CONTROLES FECHADOS (o estado normal durante a reprodução) — o foco está
   *    no player e as setas operam o VÍDEO: ← → fazem seek, ↑ abre as
   *    configurações e ↓ abre a barra. É o que o usuário pediu ("avançar e
   *    retroceder o filme pelo controle").
   *  • CONTROLES ABERTOS — as setas movem o foco entre os botões da barra (a
   *    navegação espacial global faz isso) e OK aciona o botão focado. Aqui não
   *    interceptamos nada além do BACK, para não atropelar a navegação.
   *
   * As teclas de VOLUME (24/25/164) são sempre nossas: nenhum outro componente
   * da TV usa volume, e elas precisam chegar ao áudio do aparelho.
   */
  useEffect(() => {
    if (!pronto) return;

    function focoNoPlayer(): boolean {
      const ativo = document.activeElement as HTMLElement | null;
      if (!ativo) return false;
      return (
        ativo.tagName === 'IFRAME' ||
        ativo.tagName === 'VIDEO' ||
        !!ativo.closest?.('[data-tv-player-box]')
      );
    }

    /** Teclas de mídia do controle (emitidas pelo shell como `mf-media-key`). */
    function onMediaKey(e: Event) {
      const tipo = (e as CustomEvent<string>).detail;
      if (!estadosRef.current.controles) mostrarControles();
      if (tipo === 'togglePlay') alternarPlay();
      else if (tipo === 'next') {
        if (proximo) proximoEpisodio();
      } else if (tipo === 'stop') voltar();
      else if (tipo === 'seekFwd') seek(true);
      else if (tipo === 'seekBack') seek(false);
      else if (tipo === 'volUp' || tipo === 'volDown') {
        // A camada nativa JÁ ajustou o volume da mídia (é ela o dono). Aqui só
        // lemos o novo valor e mostramos o feedback na tela — sem ajustar duas
        // vezes, que faria o volume andar em passos dobrados.
        const v = lerVolume();
        if (typeof v === 'number') setVolume(v);
        const m = lerMudo();
        if (typeof m === 'boolean') setMudo(m);
        mostrarAviso(tipo === 'volUp' ? '🔊 Volume +' : '🔉 Volume −');
      } else if (tipo === 'mute') {
        const m = lerMudo();
        if (typeof m === 'boolean') setMudo(m);
        mostrarAviso(m ? '🔇 Mudo' : '🔊 Som');
      }
    }

    // ---- Long-press do OK (~1s): PINAR/SOLTAR a barra de controles --------
    let timerLongo: number | null = null;
    let disparouLongo = false;

    function cancelarLongo() {
      if (timerLongo !== null) {
        window.clearTimeout(timerLongo);
        timerLongo = null;
      }
      disparouLongo = false;
    }

    function ehOk(e: KeyboardEvent): boolean {
      const k = e.key;
      const c = e.keyCode || e.which;
      return k === 'Enter' || k === 'OK' || k === 'Select' || c === 13 || c === 23 || c === 32;
    }

    function onKeyDown(e: KeyboardEvent) {
      const k = e.key;
      const c = e.keyCode || e.which;

      const ehBack =
        k === 'GoBack' || k === 'BrowserBack' || k === 'XF86Back' || k === 'Escape' ||
        k === 'Backspace' || c === 4 || c === 8 || c === 27 || c === 461 || c === 10009;

      // ── VOLUME: sempre nosso (24/25 = volume, 164 = mudo; 179/85 = play) ──
      if (c === 24 || k === 'AudioVolumeUp') {
        e.preventDefault();
        e.stopPropagation();
        mudarVolume(+5);
        return;
      }
      if (c === 25 || k === 'AudioVolumeDown') {
        e.preventDefault();
        e.stopPropagation();
        mudarVolume(-5);
        return;
      }
      if (c === 164 || k === 'AudioVolumeMute') {
        e.preventDefault();
        e.stopPropagation();
        alternarMudo();
        return;
      }

      // ── BACK hierárquico ─────────────────────────────────────────────────
      if (ehBack) {
        e.preventDefault();
        e.stopPropagation();
        cancelarLongo();
        tratarVoltar();
        return;
      }

      // ── Painel de configurações aberto: a navegação dele cuida das teclas ─
      if (estadosRef.current.config) return;

      // ── OK: pulso rápido mostra a barra; long-press pina/solta ────────────
      if (ehOk(e)) {
        const st = estadosRef.current;
        if (!st.controles) {
          // Só tratamos o OK quando o foco está no player; se o foco está num
          // botão da página, o fluxo normal (clique) deve valer.
          if (!focoNoPlayer()) return;
          if (!timerLongo && !disparouLongo) {
            timerLongo = window.setTimeout(() => {
              timerLongo = null;
              disparouLongo = true;
              e.preventDefault();
              e.stopPropagation();
              // Segurar OK = modo CONTROLE DO PLAYER (barra fixa, setas no vídeo).
              document.documentElement.classList.add('tv-in-player');
              setControles(true);
              setFixo(true);
              if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
              autoHideRef.current = null;
              try {
                frameRef.current?.focus({ preventScroll: true });
              } catch {
                /* ignora */
              }
            }, 1000);
          }
          return;
        }
        return;
      }

      // ── Setas: com a barra ABERTA elas navegam os botões (fluxo normal) ───
      if (estadosRef.current.controles) return;

      // Com o foco FORA do player, as setas pertencem à navegação da página.
      if (!focoNoPlayer()) return;

      const esquerda = k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21;
      const direita = k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22;
      const cima = k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19;
      const baixo = k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20;

      if (esquerda) {
        e.preventDefault();
        e.stopPropagation();
        seek(false);
        return;
      }
      if (direita) {
        e.preventDefault();
        e.stopPropagation();
        seek(true);
        return;
      }
      if (cima) {
        e.preventDefault();
        e.stopPropagation();
        abrirConfig();
        return;
      }
      if (baixo) {
        e.preventDefault();
        e.stopPropagation();
        mostrarControles();
        return;
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (ehOk(e)) cancelarLongo();
    }

    window.addEventListener('mf-media-key', onMediaKey as EventListener);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('mf-media-key', onMediaKey as EventListener);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      cancelarLongo();
    };
  }, [
    pronto,
    proximo,
    proximoEpisodio,
    voltar,
    alternarPlay,
    mostrarControles,
    esconderControles,
    abrirConfig,
    tratarVoltar,
    seek,
    mudarVolume,
    alternarMudo,
    mostrarAviso,
  ]);

  // Foco inicial: o player, para o D-pad já operar o vídeo ao entrar.
  useEffect(() => {
    if (!pronto) return;
    const t = window.setTimeout(() => {
      try {
        frameRef.current?.focus({ preventScroll: true });
      } catch {
        /* ignora */
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [pronto, recarga]);

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
      {/* O vídeo ocupa a tela. NENHUM botão solto no topo. */}
      <div className="tv-player-box" data-tv-player-box ref={frameRef} tabIndex={0}>
        <div ref={iframeWrapRef} className="tv-player-embed">
          {/* `mostrarTelaCheia={false}`: na TV o ÚNICO botão de tela cheia é o da
              barra de controles abaixo (alcançável pelo D-pad). O do embed
              aparecia como um SEGUNDO botão — o "botão duplicado" relatado. */}
          <StreamBetterEmbed
            key={`${src}-${recarga}`}
            embedUrl={src}
            onBack={voltar}
            mostrarTelaCheia={false}
          />
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

      {/* Aviso curto (volume / seek) — feedback sem poluir o vídeo. */}
      {aviso ? (
        <div className="tv-player-toast" role="status">
          {aviso}
        </div>
      ) : null}

      {/* ── UMA barra única, no rodapé. Nada solto no topo. ────────────────── */}
      <div
        className={cn('tv-player-overlay', controles && 'tv-player-overlay-ativo', fixo && 'tv-player-overlay-fixo')}
        aria-hidden={!controles}
        data-tv-hidden={!controles || undefined}
      >
        <div className="tv-player-barra">
          {/* Título discreto à esquerda (não é botão, não é uma barra de topo). */}
          <div className="tv-player-identidade">
            <TvMark className="tv-player-logo" />
            <div className="tv-player-identidade-txt">
              <div className="tv-player-title">{movie.title}</div>
              {epLabel ? <div className="tv-player-sub">Episódio {epLabel}</div> : null}
            </div>
          </div>

          <div className="tv-player-controls">
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Voltar aos detalhes"
              onClick={voltar}
            >
              <ArrowLeft className="tv-player-ctrl-icon" />
            </button>

            {/* SEEK pelo controle: ←/→ quando o foco está no player. */}
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label={`Retroceder ${PASSO_SEEK} segundos`}
              onClick={() => seek(false)}
            >
              <RotateCcw className="tv-player-ctrl-icon" />
              <span className="tv-player-ctrl-passo">{PASSO_SEEK}</span>
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

            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label={`Avançar ${PASSO_SEEK} segundos`}
              onClick={() => seek(true)}
            >
              <RotateCw className="tv-player-ctrl-icon" />
              <span className="tv-player-ctrl-passo">{PASSO_SEEK}</span>
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

            {/* Volume: as teclas +/− do controle são o caminho principal; estes
                botões repetem a ação para quem prefere navegar pela barra. */}
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Diminuir volume"
              onClick={() => mudarVolume(-5)}
            >
              <Volume1 className="tv-player-ctrl-icon" />
            </button>
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className={cn('tv-player-ctrl', mudo && 'tv-player-ctrl-ativo')}
              aria-label={mudo ? 'Ativar som' : 'Silenciar'}
              aria-pressed={mudo}
              onClick={alternarMudo}
            >
              <VolumeX className="tv-player-ctrl-icon" />
            </button>
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Aumentar volume"
              onClick={() => mudarVolume(+5)}
            >
              <Volume2 className="tv-player-ctrl-icon" />
            </button>

            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Configurações do player"
              onClick={abrirConfig}
            >
              <Settings className="tv-player-ctrl-icon" />
            </button>

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
            {temVolume
              ? '← −10s · → +10s · ↑ configurações · ↓ controles · +/− volume · segure OK para fixar'
              : '← −10s · → +10s · ↑ configurações · ↓ controles · volume pela TV · segure OK para fixar'}
          </p>
        </div>
      </div>

      {/* ── CONFIGURAÇÕES DO PLAYER (D-pad) ─────────────────────────────────── */}
      {config ? (
        <div className="tv-config" data-tv-config-panel role="dialog" aria-label="Configurações do player">
          <div className="tv-config-caixa">
            <div className="tv-config-topo">
              <h2 className="tv-config-titulo">Configurações do player</h2>
              <button
                data-tv-focusable
                data-tv-initial-focus
                tabIndex={0}
                className="tv-player-ctrl"
                aria-label="Fechar configurações"
                onClick={fecharConfig}
              >
                <X className="tv-player-ctrl-icon" />
              </button>
            </div>

            <div className="tv-config-linha">
              <span className="tv-config-rotulo">Volume</span>
              <div className="tv-config-acoes">
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn"
                  aria-label="Diminuir volume"
                  onClick={() => mudarVolume(-5)}
                >
                  −
                </button>
                <span className="tv-config-valor">
                  {mudo ? 'Mudo' : `${volume}%`}
                </span>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn"
                  aria-label="Aumentar volume"
                  onClick={() => mudarVolume(+5)}
                >
                  +
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className={cn('tv-config-btn', mudo && 'tv-config-btn-ativo')}
                  aria-label={mudo ? 'Ativar som' : 'Silenciar'}
                  aria-pressed={mudo}
                  onClick={alternarMudo}
                >
                  <VolumeX className="tv-icon-sm" />
                </button>
              </div>
            </div>

            <div className="tv-config-linha">
              <span className="tv-config-rotulo">Reprodução</span>
              <div className="tv-config-acoes">
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={() => {
                    setRecarga((r) => r + 1);
                    fecharConfig();
                    mostrarAviso('Player recarregado');
                  }}
                >
                  Recarregar player
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={() => {
                    alternarPlay();
                    mostrarAviso(emReproducao ? 'Pausado' : 'Reproduzindo');
                  }}
                >
                  {emReproducao ? 'Pausar' : 'Reproduzir'}
                </button>
                {ehSerie && proximo ? (
                  <button
                    data-tv-focusable
                    tabIndex={0}
                    className="tv-config-btn tv-config-btn-larga"
                    onClick={proximoEpisodio}
                  >
                    Próximo episódio
                  </button>
                ) : null}
              </div>
            </div>

            <div className="tv-config-linha">
              <span className="tv-config-rotulo">Tela</span>
              <div className="tv-config-acoes">
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={() => {
                    const el = frameRef.current;
                    if (!el) return;
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
                    else el.requestFullscreen?.().catch(() => undefined);
                  }}
                >
                  {typeof document !== 'undefined' && document.fullscreenElement
                    ? 'Sair da tela cheia'
                    : 'Tela cheia'}
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={voltar}
                >
                  Sair da reprodução
                </button>
              </div>
            </div>

            <p className="tv-config-dica">
              Controle remoto: ← −10s · → +10s · ↑ configurações · ↓ controles · BACK fecha esta
              janela. As fontes, a qualidade e as legendas são controladas pelo próprio player do
              provedor.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
