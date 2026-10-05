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
import {
  acionarControlePlayer,
  alternarPlayPausePlayer,
  type AcaoControle,
} from '@/tv/controlePlayer';
import { classificarTecla } from '@/tv/teclasPlayer';
import { useEstadoVideoPlayer } from '@/tv/useEstadoVideoPlayer';
import { TvProgresso } from './TvProgresso';
import {
  PASSO_SEEK,
  acumularMovimento,
  avancar,
  duracaoDoCatalogo,
  lerEstadoDoPlayer,
  retroceder,
  type EstadoProgresso,
  type Movimento,
} from './playerProgresso';
import { TvMark } from './TvBrand';
import {
  ajustarVolume,
  definirMudo,
  lerMudo,
  lerVolume,
  volumeNativoDisponivel,
} from '@/lib/volumeTv';
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
 * ══════════════════════════════════════════════════════════════════════════════
 * REESCRITA DO CONTROLE REMOTO (esta versão) — CAUSA RAIZ DO BUG DO OK
 * ══════════════════════════════════════════════════════════════════════════════
 * A lógica de teclado estava ESPALHADA por três lugares — este arquivo
 * (keydown/keyup), o `useTvNavigation` global (captura) e o `useTvPlayerControls`
 * (legado) — cada um com a sua própria lista de keyCodes. As listas divergiam e
 * a MESMA pulsação podia ser tratada por dois donos (pausar e retomar no mesmo
 * toque). A correção NÃO remenda: substitui por UM ÚNICO caminho.
 *
 *  • `teclasPlayer.ts` é a FONTE ÚNICA de "que tecla é esta?" (OK/ENTER, setas,
 *    voltar, volume) — uma definição só, sem listas divergentes.
 *  • UM ÚNICO listener de `keydown` (fase de captura) trata TODAS as teclas do
 *    controle. Ele chama `preventDefault()`/`stopPropagation()` UMA vez por
 *    tecla reconhecida, o que faz o `useTvNavigation` global (que respeita
 *    `e.defaultPrevented`) se abster — sem dois donos para a mesma tecla.
 *  • O listener é registrado UMA vez (deps estáveis) e removido no cleanup;
 *    nunca é recriado a cada renderização.
 *  • O estado de play/pause vem do `<video>` REAL (`video.paused`) via
 *    `useEstadoVideoPlayer` (eventos `play`/`pause`/`ended`/`error`/`canplay`/
 *    `loadedmetadata`/`timeupdate`/`volumechange`). Quando o embed do provedor é
 *    de OUTRA origem e o estado não é legível, mantém-se o toggle otimista —
 *    honesto, nunca um valor inventado.
 *
 * ── HIERARQUIA DO BACK (nunca fecha o app de surpresa) ───────────────────────
 *  1º painel de configurações aberto  → fecha o painel;
 *  2º controles abertos               → fecha os controles;
 *  3º volta para os DETALHES do título.
 */

/** Tempo de inatividade antes de esconder os controles (ms). */
const AUTO_HIDE_MS = 4000;

/**
 * Cadência do movimento CONTÍNUO ao segurar ←/→ (ms).
 *
 * Um clique = um passo de 10s. Segurar = um passo a cada 450 ms, de forma
 * controlada — nunca na velocidade da auto-repetição do sistema (que dispara
 * ~30 passos por segundo e tornaria o avanço inutilizável).
 */
const INTERVALO_SEGURAR_MS = 450;

/** Quanto tempo o indicador de movimento (⏩ +30s) fica na tela depois do último passo. */
const MOVIMENTO_VISIVEL_MS = 1200;

/** Quanto tempo a barra de progresso/tempo fica na tela depois de um comando. */
const PROGRESSO_VISIVEL_MS = 3500;

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
  /** Recria o embed ("Recarregar player") sem duplicar iframes. */
  const [recarga, setRecarga] = useState(0);

  /**
   * ── ESTADO REAL DO VÍDEO ────────────────────────────────────────────────────
   * `estadoVideo` acompanha o `<video>` de verdade (eventos reais). Quando o
   * embed do provedor é de outra origem, `legivel` é `false` e o estado cai no
   * toggle otimista abaixo — sem inventar um valor.
   */
  const { estado: estadoVideo, reler: relerVideo } = useEstadoVideoPlayer(iframeWrapRef, recarga);
  /** Estado otimista de play/pause, usado SÓ quando o vídeo não é legível. */
  const [pausadoOtimista, setPausadoOtimista] = useState(false);
  /** O vídeo está pausado? (estado real quando legível; otimista quando não). */
  const pausado = estadoVideo.legivel ? estadoVideo.pausado : pausadoOtimista;
  /** Espelho para leitura síncrona nos listeners (sem re-render). */
  const emReproducao = !pausado;

  /**
   * ── PROGRESSO / TEMPO (barra, +10s/−10s, tempo restante) ────────────────────
   * `posicao`/`duracao` em segundos. `posicaoReal`/`duracaoReal` dizem se o
   * número foi LIDO do player ou vem do acúmulo dos comandos + catálogo — a
   * interface mostra a diferença em vez de inventar um tempo (ver
   * `playerProgresso.ts`).
   */
  const [progresso, setProgresso] = useState<EstadoProgresso>({
    posicao: 0,
    duracao: 0,
    posicaoReal: false,
    duracaoReal: false,
  });
  /** Movimento acumulado do seek (⏩ +30s) — some sozinho depois do último passo. */
  const [movimento, setMovimento] = useState<Movimento | null>(null);
  /** A barra de progresso está na tela? (camada própria, independente dos controles) */
  const [progressoVisivel, setProgressoVisivel] = useState(false);
  const progressoTimerRef = useRef<number | null>(null);
  const movimentoTimerRef = useRef<number | null>(null);
  /** Cadência do avanço/retrocesso contínuo (segurar ←/→ ou ⏪/⏩). */
  const seekTimerRef = useRef<number | null>(null);
  /** Sentido do movimento contínuo em andamento. */
  const direcaoSeguradaRef = useRef(false);
  /**
   * Instante do último evento de seek vindo do controle. Enquanto o botão está
   * pressionado o aparelho repete o evento e este carimbo se renova; quando o
   * usuário solta, a repetição para — e a cadência contínua se encerra sozinha
   * (rede de segurança para controles que não mandam keyup).
   */
  const ultimoEventoSeekRef = useRef(0);

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
   * ── PROGRESSO: visibilidade, indicador de movimento e agendamentos ──────────
   * A barra/tempo aparece a cada comando e se esconde sozinha; o indicador do
   * seek (⏩ +30s) some um pouco depois do último passo.
   */
  const agendarEsconderProgresso = useCallback(() => {
    if (progressoTimerRef.current !== null) window.clearTimeout(progressoTimerRef.current);
    progressoTimerRef.current = window.setTimeout(() => setProgressoVisivel(false), PROGRESSO_VISIVEL_MS);
  }, []);

  const agendarLimparMovimento = useCallback(() => {
    if (movimentoTimerRef.current !== null) window.clearTimeout(movimentoTimerRef.current);
    movimentoTimerRef.current = window.setTimeout(() => setMovimento(null), MOVIMENTO_VISIVEL_MS);
  }, []);

  /**
   * Devolve o foco ao JOGADOR — no WRAPPER (mesma origem), NUNCA no iframe.
   *
   * CAUSA RAIZ (relato no APARELHO: "as setas/volume funcionam, mas o OK não
   * pausa"): o iframe do player é de OUTRA ORIGEM. Enquanto ele é o
   * `document.activeElement`, o navegador entrega TODA tecla ao documento do
   * player e o documento PAI não recebe NADA. O wrapper `[data-tv-player-box]`
   * é da MESMA origem: com ele focado o site recebe o OK e as setas, e a ponte
   * nativa (`enviarTeclaPlayer`) entrega a TECLA REAL ao player.
   */
  const focarJogador = useCallback(() => {
    const alvo = frameRef.current ?? iframeWrapRef.current;
    try {
      alvo?.focus({ preventScroll: true });
    } catch {
      /* ignora */
    }
  }, []);

  const comandarPlayer = useCallback((acao: AcaoControle, passo: number = PASSO_SEEK) => {
    const iframe = iframeWrapRef.current?.querySelector('iframe');
    // A camada de integração entrega a TECLA REAL ao player quando o APK está
    // presente e, quando não está, mantém o caminho anterior (postMessage +
    // vídeo nativo).
    acionarControlePlayer(iframe, acao, passo);
  }, []);

  /**
   * PLAY/PAUSE pelo controle (barra + OK/ENTER + tecla de mídia).
   *
   * FONTE ÚNICA do toggle. `alternarPlayPausePlayer` decide pelo estado REAL do
   * `<video>` quando ele é legível e, quando não é (embed cross-origin), entrega
   * a TECLA REAL de play/pause pela ponte nativa. O ícone acompanha o estado
   * real; sem leitura possível, mantém o toggle otimista.
   */
  const alternarPlay = useCallback(() => {
    const iframe = iframeWrapRef.current?.querySelector('iframe') ?? null;
    const resultado = alternarPlayPausePlayer(iframe);
    if (resultado === null) setPausadoOtimista((p) => !p);
    else setPausadoOtimista(resultado);
    // Relê o estado real logo depois, para o ícone não atrasar.
    window.setTimeout(() => relerVideo(), 0);
  }, [relerVideo]);

  /**
   * APLICA UM PASSO de ±10s: manda o comando ao player, move o tempo mostrado
   * (respeitando 00:00 e a duração total) e acumula o INDICADOR de movimento.
   */
  const aplicarPasso = useCallback(
    (frente: boolean) => {
      comandarPlayer(frente ? 'seekFwd' : 'seekBack', PASSO_SEEK);
      setProgresso((antes) => ({
        ...antes,
        posicao: frente
          ? avancar(antes.posicao, PASSO_SEEK, antes.duracao)
          : retroceder(antes.posicao, PASSO_SEEK),
      }));
      setMovimento((m) => acumularMovimento(m, frente ? 'frente' : 'volta', PASSO_SEEK));
      setProgressoVisivel(true);
      agendarEsconderProgresso();
      agendarLimparMovimento();
    },
    [comandarPlayer, agendarEsconderProgresso, agendarLimparMovimento],
  );

  /** Seek de UM passo (botões da barra e clique único das setas). */
  const seek = useCallback((frente: boolean) => aplicarPasso(frente), [aplicarPasso]);

  /**
   * SEEK CONTÍNUO (segurar ←/→ ou o botão de avançar/retroceder).
   *
   * O primeiro passo é IMEDIATO (clique único = +10s). Enquanto o controle
   * continuar mandando o evento, um passo roda a cada 450 ms — cadência
   * controlada, não a auto-repetição bruta do sistema. Quando os eventos param
   * (o usuário soltou), a rede de segurança encerra o movimento.
   */
  const seekContinuo = useCallback(
    (frente: boolean) => {
      ultimoEventoSeekRef.current = Date.now();
      if (seekTimerRef.current !== null) {
        // Já em movimento: só reorienta (segurar o outro sentido inverte).
        direcaoSeguradaRef.current = frente;
        return;
      }
      direcaoSeguradaRef.current = frente;
      aplicarPasso(frente);
      seekTimerRef.current = window.setInterval(() => {
        if (Date.now() - ultimoEventoSeekRef.current > 1600) {
          if (seekTimerRef.current !== null) window.clearInterval(seekTimerRef.current);
          seekTimerRef.current = null;
          return;
        }
        aplicarPasso(direcaoSeguradaRef.current);
      }, INTERVALO_SEGURAR_MS);
    },
    [aplicarPasso],
  );

  /** Encerra o movimento contínuo (soltar o botão). */
  const pararSeekContinuo = useCallback(() => {
    if (seekTimerRef.current !== null) window.clearInterval(seekTimerRef.current);
    seekTimerRef.current = null;
  }, []);

  /**
   * TROCA DE TÍTULO/EPISÓDIO: o progresso mostrado é o DESTA reprodução.
   */
  const chaveTitulo = `${movie?.id ?? ''}/${params.get('temporada') ?? ''}/${params.get('episodio') ?? ''}`;
  const chaveTituloRef = useRef('');
  useEffect(() => {
    if (chaveTituloRef.current === chaveTitulo) return;
    chaveTituloRef.current = chaveTitulo;
    setProgresso({ posicao: 0, duracao: 0, posicaoReal: false, duracaoReal: false });
    setMovimento(null);
  }, [chaveTitulo]);

  /**
   * DURAÇÃO conhecida do catálogo (`duration`, em minutos) — o MESMO dado que o
   * card e a tela de detalhes já exibem. É o que permite mostrar
   * "00:35:20 / 01:52:40" e o tempo restante mesmo com o player em outra origem.
   */
  useEffect(() => {
    const seg = duracaoDoCatalogo(movie?.duration);
    if (seg <= 0) return;
    setProgresso((antes) => ({
      ...antes,
      duracao: seg,
      duracaoReal: false,
      posicao: antes.posicaoReal ? antes.posicao : Math.min(antes.posicao, seg),
    }));
  }, [movie?.duration]);

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
  const mostrarControles = useCallback((ocultarEmMs: number = AUTO_HIDE_MS) => {
    setControles(true);
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    // Na sessão de controles do player a barra fica FIXA (não auto-oculta) para
    // o controle remoto seguir operando o player sem perder o contexto.
    if (ocultarEmMs > 0) {
      autoHideRef.current = window.setTimeout(() => setControles(false), ocultarEmMs);
    } else {
      autoHideRef.current = null;
    }
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
      focarJogador();
    } catch {
      /* ignora */
    }
  }, [focarJogador]);

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
      focarJogador();
    } catch {
      /* ignora */
    }
  }, [focarJogador]);

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

  // O estado precisa ser legível dentro dos listeners sem recriá-los a cada mudança.
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
    if (progressoTimerRef.current !== null) window.clearTimeout(progressoTimerRef.current);
    if (movimentoTimerRef.current !== null) window.clearTimeout(movimentoTimerRef.current);
    if (seekTimerRef.current !== null) window.clearInterval(seekTimerRef.current);
  }, []);

  /** Só faz sentido quando há assinante e fonte real de vídeo. */
  const pronto = Boolean(user) && assinante && Boolean(src);

  /**
   * LEITURA DO TEMPO REAL do player quando o navegador permite (player da mesma
   * origem ou embed que exponha `mfEstadoDoPlayer`). No MovieFlix TV o embed do
   * provedor é de OUTRA ORIGEM: a leitura devolve `null` e a barra segue com a
   * posição conhecida + os comandos do controle — sem inventar tempo.
   */
  useEffect(() => {
    if (!pronto) return;
    let vivo = true;
    const t = window.setInterval(() => {
      if (!vivo) return;
      const iframe = iframeWrapRef.current?.querySelector('iframe') as HTMLIFrameElement | null;
      const lido = lerEstadoDoPlayer(iframe);
      if (!lido) return;
      setProgresso((antes) =>
        Math.abs(lido.posicao - antes.posicao) < 0.5 && lido.duracao === antes.duracao ? antes : lido,
      );
    }, 900);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [pronto, recarga]);

  /**
   * ══════════════════════════════════════════════════════════════════════════════
   * CONTROLE REMOTO — CAMINHO ÚNICO
   * ══════════════════════════════════════════════════════════════════════════════
   * UM ÚNICO listener de `keydown` (fase de captura) trata TODAS as teclas do
   * controle, usando `classificarTecla` (fonte única). Cada tecla reconhecida
   * recebe `preventDefault()`/`stopPropagation()` UMA vez — o que faz o
   * `useTvNavigation` global (que respeita `e.defaultPrevented`) se abster, sem
   * dois donos para a mesma pulsação. O listener é registrado UMA vez e removido
   * no cleanup; nunca é recriado a cada renderização.
   *
   * As teclas de MÍDIA do shell (`mf-media-key`) têm um caminho próprio (o
   * keydown não as vê) e entram na MESMA função de toggle.
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

    /** Teclas de mídia do controle (emitidas pelo shell como `mf-media-key`). */
    function onMediaKey(e: Event) {
      const tipo = (e as CustomEvent<string>).detail;
      // OK/▶ = play/pause: NUNCA abre a barra — o comando tem de chegar ao vídeo.
      if (tipo === 'togglePlay') {
        alternarPlay();
        return;
      }
      if (tipo === 'seekFwd' || tipo === 'seekBack') {
        mostrarControles(0);
        seekContinuo(tipo === 'seekFwd');
        return;
      }
      if (!estadosRef.current.controles) mostrarControles();
      if (tipo === 'next') {
        if (proximo) proximoEpisodio();
      } else if (tipo === 'stop') voltar();
      else if (tipo === 'volUp' || tipo === 'volDown') {
        // A camada nativa JÁ ajustou o volume da mídia (é ela o dono). Aqui só
        // lemos o novo valor e mostramos o feedback na tela.
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

    /** CAMINHO ÚNICO das teclas do controle (keydown, fase de captura). */
    function onKeyDown(e: KeyboardEvent) {
      const acao = classificarTecla(e);
      if (!acao) return;

      // ── VOLUME: sempre nosso (nenhum outro componente da TV usa volume) ──
      if (acao === 'volumeUp') {
        e.preventDefault();
        e.stopPropagation();
        mudarVolume(+5);
        return;
      }
      if (acao === 'volumeDown') {
        e.preventDefault();
        e.stopPropagation();
        mudarVolume(-5);
        return;
      }
      if (acao === 'mute') {
        e.preventDefault();
        e.stopPropagation();
        alternarMudo();
        return;
      }

      // ── BACK hierárquico ─────────────────────────────────────────────────
      if (acao === 'back') {
        e.preventDefault();
        e.stopPropagation();
        cancelarLongo();
        tratarVoltar();
        return;
      }

      // ── Painel de configurações aberto: a navegação dele cuida das teclas ─
      if (estadosRef.current.config) return;

      // ── OK/ENTER: PLAY/PAUSE (UMA ação por toque) ────────────────────────
      // O toggle sai no PRÓPRIO keydown (o keyup do OK frequentemente não chega
      // à página no WebView). O long-press (~1s) apenas PINA a barra — nunca
      // alterna de novo, então um toque = uma ação.
      if (acao === 'ok') {
        if (estadosRef.current.controles) return; // barra aberta: OK aciona o botão focado
        if (!focoNoPlayer()) return; // foco na interface: o fluxo normal (clique) vale
        e.preventDefault();
        e.stopPropagation();
        if (!timerLongo && !disparouLongo) {
          timerLongo = window.setTimeout(() => {
            timerLongo = null;
            disparouLongo = true;
            // Segurar OK = modo CONTROLE DO PLAYER (pinça a barra fixa).
            document.documentElement.classList.add('tv-in-player');
            setControles(true);
            setFixo(true);
            if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
            autoHideRef.current = null;
          }, 1000);
        }
        alternarPlay();
        return;
      }

      // ── Setas com a barra ABERTA: navegam os botões (fluxo normal) ───────
      if (estadosRef.current.controles) {
        // Se o foco voltou ao JOGADOR, a barra fecha e as setas voltam a operar
        // o vídeo: a sessão de controles termina sem prender o usuário.
        if (focoNoPlayer()) esconderControles();
        return;
      }

      // Com o foco FORA do player, as setas pertencem à navegação da página.
      if (!focoNoPlayer()) return;

      if (acao === 'seekFwd') {
        e.preventDefault();
        e.stopPropagation();
        seekContinuo(true);
        return;
      }
      if (acao === 'seekBack') {
        e.preventDefault();
        e.stopPropagation();
        seekContinuo(false);
        return;
      }
      if (acao === 'cima') {
        e.preventDefault();
        e.stopPropagation();
        abrirConfig();
        return;
      }
      if (acao === 'baixo') {
        e.preventDefault();
        e.stopPropagation();
        mostrarControles();
        return;
      }
    }

    /** Soltar as teclas: encerra o movimento contínuo e o long-press do OK. */
    function onKeyUp(e: KeyboardEvent) {
      const acao = classificarTecla(e);
      if (acao === 'ok') {
        cancelarLongo();
        return;
      }
      if (acao === 'seekFwd' || acao === 'seekBack') {
        pararSeekContinuo();
      }
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
    seekContinuo,
    pararSeekContinuo,
    mostrarControles,
    esconderControles,
    abrirConfig,
    tratarVoltar,
    mudarVolume,
    alternarMudo,
    mostrarAviso,
  ]);

  /**
   * MARCADOR DE POSSE DO PLAYER.
   *
   * Enquanto esta tela está montada, o atributo `data-tv-player-ativo` no
   * `<html>` diz à navegação espacial global (`useTvNavigation`) que o player é
   * o DONO das teclas do controle. É o que impede o BACK de ser tratado por dois
   * caminhos: o player decide a hierarquia (fechar configurações → fechar
   * controles → sair) e a navegação global se abstém. Sem isso, o BACK podia
   * navegar de página no meio da reprodução — o "saiu do player" relatado.
   */
  useEffect(() => {
    if (!pronto) return;
    document.documentElement.setAttribute('data-tv-player-ativo', '1');
    return () => document.documentElement.removeAttribute('data-tv-player-ativo');
  }, [pronto]);

  // Foco inicial: o player, para o D-pad já operar o vídeo ao entrar.
  useEffect(() => {
    if (!pronto) return;
    const t = window.setTimeout(() => {
      try {
        focarJogador();
      } catch {
        /* ignora */
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [pronto, recarga, focarJogador]);

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
          onClick={() => mostrarControles()}
        />
      </div>

      {/* Aviso curto (volume) — feedback sem poluir o vídeo. */}
      {aviso ? (
        <div className="tv-player-toast" role="status">
          {aviso}
        </div>
      ) : null}

      {/* ── BARRA DE PROGRESSO E TEMPO (camada própria, no alto) ──────────────
          Aparece a cada comando do controle (⏩ +10s, OK, ←/→) e se esconde
          sozinha — é a "interface mais profissional para mostrar o progresso":
          tempo atual, duração total, quanto falta e a posição na barra. */}
      <div
        className={cn('tv-player-progresso-camada', progressoVisivel && 'tv-player-progresso-camada-ativo')}
        aria-hidden={!progressoVisivel}
      >
        <TvProgresso
          posicao={progresso.posicao}
          duracao={progresso.duracao}
          posicaoReal={progresso.posicaoReal}
          duracaoReal={progresso.duracaoReal}
          movimento={progressoVisivel ? movimento : null}
          pausado={pausado}
        />
      </div>

      {/* ── UMA barra única, no rodapé. Nada solto no topo. ─────────────────── */}
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
              ? '← −10s · → +10s (segure para contínuo) · OK pausa/continua · ↑ configurações · ↓ controles · +/− volume'
              : '← −10s · → +10s (segure para contínuo) · OK pausa/continua · ↑ configurações · ↓ controles · volume pela TV'}
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
