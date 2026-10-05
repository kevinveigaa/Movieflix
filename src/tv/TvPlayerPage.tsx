import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
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
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV (controle remoto).
 * ══════════════════════════════════════════════════════════════════════════════
 * REESCRITA DO ZERO (esta versão) — o player anterior tinha VÁRIOS donos das
 * teclas do controle (o `useTvNavigation` global, o `useTvPlayerControls` legado
 * e handlers espalhados dentro desta página), cada um com a sua própria lista de
 * keyCodes. As listas divergiam e a MESMA pulsação podia ser tratada por dois
 * donos (pausar e retomar no mesmo toque) — o sintoma relatado: "OK não pausa;
 * OK de novo não despausa; nada funciona pelo controle".
 *
 * Esta versão tem UM ÚNICO caminho:
 *   • `teclasPlayer.ts` é a FONTE ÚNICA de "que tecla é esta?" (OK/ENTER, setas,
 *     voltar, volume) — uma definição só, sem listas divergentes;
 *   • UM ÚNICO listener de `keydown` (fase de captura) trata TODAS as teclas do
 *     controle. Ele chama `preventDefault()`/`stopPropagation()` UMA vez por
 *     tecla reconhecida, o que faz o `useTvNavigation` global (que respeita
 *     `e.defaultPrevented`) se abster — sem dois donos para a mesma pulsação;
 *   • o listener é registrado UMA vez (deps estáveis) e removido no cleanup;
 *   • o atributo `data-tv-player-ativo` no `<html>` diz à navegação espacial
 *     global que o player é o DONO das teclas enquanto está montado.
 *
 * REPRODUÇÃO: o embed OFICIAL do StreamBetter, montado em iframe — a MESMA
 * lógica do site e do app Mobile (`StreamBetterEmbed` + `src/lib/strembetter`).
 * O provedor exige ser carregado DENTRO de um iframe, e é exatamente assim que
 * carregamos. A proteção contra popups/redirects/anúncios é o antiAds global
 * (`src/lib/antiAds.ts`), com Cloudflare/Turnstile preservados.
 *
 * ── REGRESSÃO CORRIGIDA: O VÍDEO NÃO INICIAVA ────────────────────────────────
 * A versão anterior montava uma SUPERFÍCIE CLICÁVEL (`tv-player-tap`) cobrindo
 * TODO o vídeo (z-index 15, acima do iframe). Ela engolia o primeiro clique/toque
 * e o iframe do provedor nunca recebia o gesto inicial — o filme não começava a
 * reproduzir. Ela foi REMOVIDA: o iframe fica diretamente acessível e recebe o
 * foco/gesto. Além disso, o embed é montado com `autoplay=1` e o foco vai para o
 * contêiner do player (mesma origem) assim que ele carrega, para o D-pad já
 * operar o vídeo.
 *
 * ── BARRA INFERIOR REMOVIDA ──────────────────────────────────────────────────
 * A barra de botões do rodapé (`tv-player-barra`) — com play/pause, seek,
 * volume, engrenagem, tela cheia e sair — foi REMOVIDA POR COMPLETO. Nenhum
 * daqueles botões funcionava pelo controle (o player do provedor vive num iframe
 * de outra origem e não aceita comandos por JS) e eles só poluíam a tela. O
 * controle remoto opera o player DIRETO pelas teclas (ver abaixo).
 *
 * ── TECLAS DO CONTROLE (implementação única) ─────────────────────────────────
 *   • OK/ENTER (key "Enter"/"OK"/"Select", code "Enter", keyCode 13/23/66)
 *       → alterna play/pause com UMA única ação por toque (ignora auto-repeat);
 *   • ← / →  → retrocede/avança 10s de verdade (via ponte nativa);
 *   • BACK   → sai do player devolvendo o controle à interface (detalhes);
 *   • +/− / MUTE → volume da mídia do aparelho (opcional, não é requisito).
 *
 * ── ESTADO VISUAL ────────────────────────────────────────────────────────────
 * O estado de play/pause vem do `<video>` REAL quando ele é legível
 * (`useEstadoVideoPlayer`); quando o embed é de outra origem e o estado não é
 * legível, mantém-se o toggle otimista — honesto, nunca um valor inventado. A
 * camada de progresso (`TvProgresso`) mostra ▶ Reproduzindo / ⏸ Pausado, o tempo
 * atual, a duração total, quanto falta e a posição na barra.
 */

/** Quanto tempo o indicador de movimento (⏩ +30s) fica na tela depois do último passo. */
const MOVIMENTO_VISIVEL_MS = 1200;

/** Quanto tempo a barra de progresso/tempo fica na tela depois de um comando. */
const PROGRESSO_VISIVEL_MS = 3500;

/**
 * Anexa `autoplay=1` à URL do embed (o provedor inicia a reprodução sozinho).
 * Não altera a URL base compartilhada com o site/Mobile — é um reforço LOCAL do
 * player da TV, aplicado só aqui.
 */
function comAutoplay(url: string): string {
  if (!url) return url;
  if (/[?&]autoplay=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
}

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

  /** Recria o embed ("Recarregar player") sem duplicar iframes. */
  const [recarga, setRecarga] = useState(0);

  /**
   * ── ESTADO REAL DO VÍDEO ──────────────────────────────────────────────────
   * `estadoVideo` acompanha o `<video>` de verdade (eventos reais). Quando o
   * embed do provedor é de outra origem, `legivel` é `false` e o estado cai no
   * toggle otimista abaixo — sem inventar um valor.
   */
  const { estado: estadoVideo, reler: relerVideo } = useEstadoVideoPlayer(iframeWrapRef, recarga);
  /** Estado otimista de play/pause, usado SÓ quando o vídeo não é legível. */
  const [pausadoOtimista, setPausadoOtimista] = useState(false);
  /** O vídeo está pausado? (estado real quando legível; otimista quando não). */
  const pausado = estadoVideo.legivel ? estadoVideo.pausado : pausadoOtimista;

  /**
   * ── PROGRESSO / TEMPO (barra, +10s/−10s, tempo restante) ──────────────────
   * `posicao`/`duracao` em segundos. `posicaoReal`/`duracaoReal` dizem se o
   * número foi LIDO do player ou vem do acúmulo dos comandos + catálogo — a
   * interface mostra a diferença em vez de inventar um tempo.
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
  /** Cadência do avanço/retrocesso contínuo (segurar ←/→). */
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
        src: comAutoplay(streambetterSeriesEmbedUrl(movie.tmdb_id, atual.season, atual.episode)),
        proximo: prox,
      };
    }

    if (movie.tmdb_id) return { src: comAutoplay(streambetterMovieEmbedUrl(movie.tmdb_id)), proximo: null };
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
   * ── PROGRESSO: visibilidade, indicador de movimento e agendamentos ────────
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

  const comandarPlayer = useCallback((acao: 'seekFwd' | 'seekBack', passo: number = PASSO_SEEK) => {
    const iframe = iframeWrapRef.current?.querySelector('iframe');
    acionarControlePlayer(iframe, acao, passo);
  }, []);

  /**
   * PLAY/PAUSE pelo controle (OK/ENTER e tecla de mídia).
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

  /**
   * SEEK CONTÍNUO (segurar ←/→).
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
      }, 450);
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

  useEffect(
    () => () => {
      if (progressoTimerRef.current !== null) window.clearTimeout(progressoTimerRef.current);
      if (movimentoTimerRef.current !== null) window.clearTimeout(movimentoTimerRef.current);
      if (seekTimerRef.current !== null) window.clearInterval(seekTimerRef.current);
    },
    [],
  );

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
   * ══════════════════════════════════════════════════════════════════════════
   * CONTROLE REMOTO — CAMINHO ÚNICO
   * ══════════════════════════════════════════════════════════════════════════
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

    /** Teclas de mídia do controle (emitidas pelo shell como `mf-media-key`). */
    function onMediaKey(e: Event) {
      const tipo = (e as CustomEvent<string>).detail;
      if (tipo === 'togglePlay') {
        alternarPlay();
        return;
      }
      if (tipo === 'seekFwd' || tipo === 'seekBack') {
        seekContinuo(tipo === 'seekFwd');
        return;
      }
      if (tipo === 'next') {
        if (proximo) proximoEpisodio();
      } else if (tipo === 'stop') {
        voltar();
      }
    }

    /** CAMINHO ÚNICO das teclas do controle (keydown, fase de captura). */
    function onKeyDown(e: KeyboardEvent) {
      const acao = classificarTecla(e);
      if (!acao) return;

      // ── VOLUME: sempre nosso (nenhum outro componente da TV usa volume) ──
      // O volume da mídia é ajustado pela camada nativa (MainActivity); aqui só
      // consumimos a tecla para não haver dois donos.
      if (acao === 'volumeUp' || acao === 'volumeDown' || acao === 'mute') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // ── BACK: sai do player devolvendo o controle à interface ────────────
      if (acao === 'back') {
        e.preventDefault();
        e.stopPropagation();
        voltar();
        return;
      }

      // ── OK/ENTER: PLAY/PAUSE (UMA ação por toque) ────────────────────────
      // O toggle sai no PRÓPRIO keydown (o keyup do OK frequentemente não chega
      // à página no WebView). `e.repeat` é ignorado para que segurar o OK NÃO
      // dispare uma sequência de toggles — um toque = uma ação.
      if (acao === 'ok') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        alternarPlay();
        return;
      }

      // ── SETAS: avançar/retroceder de verdade (±10s) ──────────────────────
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

      // ↑/↓ não têm função no player (a barra de botões foi removida): consome
      // para não vazar para a navegação espacial global.
      if (acao === 'cima' || acao === 'baixo') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    /** Soltar as teclas: encerra o movimento contínuo. */
    function onKeyUp(e: KeyboardEvent) {
      const acao = classificarTecla(e);
      if (acao === 'seekFwd' || acao === 'seekBack') pararSeekContinuo();
    }

    window.addEventListener('mf-media-key', onMediaKey as EventListener);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('mf-media-key', onMediaKey as EventListener);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [pronto, proximo, proximoEpisodio, voltar, alternarPlay, seekContinuo, pararSeekContinuo]);

  /**
   * MARCADOR DE POSSE DO PLAYER.
   *
   * Enquanto esta tela está montada, o atributo `data-tv-player-ativo` no
   * `<html>` diz à navegação espacial global (`useTvNavigation`) que o player é
   * o DONO das teclas do controle. É o que impede o BACK de ser tratado por dois
   * caminhos: o player decide (sair do player) e a navegação global se abstém.
   */
  useEffect(() => {
    if (!pronto) return;
    document.documentElement.setAttribute('data-tv-player-ativo', '1');
    return () => document.documentElement.removeAttribute('data-tv-player-ativo');
  }, [pronto]);

  // Foco inicial: o contêiner do player (mesma origem), para o D-pad já operar
  // o vídeo ao entrar. O iframe continua acessível para o gesto de reprodução.
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
      {/* O vídeo ocupa a tela. NENHUM botão solto, NENHUMA barra de controles. */}
      <div className="tv-player-box" data-tv-player-box ref={frameRef} tabIndex={0}>
        <div ref={iframeWrapRef} className="tv-player-embed">
          {/* `mostrarTelaCheia={false}`: na TV o embed não desenha a própria
              barra de tela cheia (o player é imersivo por natureza). */}
          <StreamBetterEmbed
            key={`${src}-${recarga}`}
            embedUrl={src}
            onBack={voltar}
            mostrarTelaCheia={false}
          />
        </div>
      </div>

      {/* ── BARRA DE PROGRESSO E TEMPO (camada própria, no alto) ──────────────
          Aparece a cada comando do controle (⏩ +10s, OK, ←/→) e se esconde
          sozinha — mostra o tempo atual, a duração total, quanto falta, a
          posição na barra e o estado (▶ Reproduzindo / ⏸ Pausado). */}
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
    </div>
  );
}
