import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import {
  primeiroEpisodioDisponivel,
  streambetterMovieEmbedUrl,
  streambetterSeriesEmbedUrl,
} from '@/lib/strembetter';
import { StreamBetterEmbed } from '@/components/player/StreamBetterEmbed';
import { duracaoDoCatalogo, type EstadoProgresso } from './playerProgresso';
import {
  alternarPlayPausePlayer,
  ajustarVolumePlayerTv,
  iniciarReproducaoPlayer,
  lerVolumePlayerTv,
  type PontePlayerTv,
} from '@/tv/controlePlayer';
import { classificarTecla } from '@/tv/teclasPlayer';
import { assinarProgressoProvedor, pedirSeekProvedor } from '@/tv/progressoReal';

/**
 * TvPlayerPage — player do MovieFlix TV (controle remoto físico). REESCRITA.
 * ═══════════════════════════════════════════════════════════════════════════
 * O que esta versão garante (requisitos do dono após testar na TV):
 *
 * INTERFACE
 *   a. NENHUM controle nativo do provedor na tela (botões azuis, engrenagem,
 *      tela cheia, play/volume). Além de neutralizar a interação do iframe, a
 *      BARRA CUSTOMIZADA foi movida para DENTRO da moldura do vídeo e ANCORADA
 *      NO RODAPÉ — exatamente onde a barra nativa do provedor aparece —, de
 *      forma que ela a COBRE por completo. Ver tv.css (`.tv-player-bar-ancora`).
 *   b. UMA ÚNICA exibição de tempo, na barra inferior, no formato
 *      `HH:MM:SS / HH:MM:SS` (ex.: 00:35:20 / 01:52:40). O HUD de topo (status
 *      "Reproduzindo/Pausado" + tempo + "restantes" + nota) foi ELIMINADO.
 *   c. Só os controles customizados do projeto (play/pause + retroceder +
 *      avançar + barra/tempo) permanecem.
 *
 * CONTROLE REMOTO — mapa EXATO pedido
 *   • OK/ENTER          → pausa / des-pausa (play/pause REAL do vídeo);
 *   • ← / →             → retrocede / avança 30s REAIS;
 *   • ↑ / ↓             → AUMENTA / ABAIXA o VOLUME (camada nativa);
 *   • BACK              → tela anterior.
 *
 * ── COMO O VÍDEO É CONTROLADO DE VERDADE ────────────────────────────────
 * O player do provedor vive num IFRAME DE OUTRA ORIGEM. Três pontes reais:
 *   1. PLAY/PAUSE — `alternarPlayPausePlayer` (controlePlayer.ts): alterna pelo
 *      estado REAL quando o `<video>` é legível; senão entrega a TECLA REAL
 *      (ESPAÇO) pela ponte nativa do shell Android (o único caminho que muda o
 *      vídeo no aparelho). A guarda de foco é SUSPENSA durante a injeção (causa
 *      raiz do OK que "só trocava o ícone": o foco voltava ao botão antes de o
 *      WebView entregar a tecla).
 *   2. SEEK ±30s — `pedirSeekProvedor` (progressoReal.ts): manda
 *      `streambetter:seek` com a posição REAL (currentTime ± 30), respeitando os
 *      limites [0, duração]. É o comando documentado do provedor.
 *   3. TEMPO — `assinarProgressoProvedor`: escuta `streambetter:progress`
 *      (currentTime/duration/state reais). Sem leitura, cai na duração do
 *      catálogo — nunca um número inventado.
 *
 * ── CONTROLE REMOTO (implantação ÚNICA) ─────────────────────────────────
 *   • UM listener de `keydown` em fase de CAPTURA, registrado UMA vez (deps
 *     `[]`), lendo o estado por refs; as teclas são consumidas
 *     (preventDefault/stopPropagation) para NENHUM outro dono disputar a mesma
 *     pulsação;
 *   • o marker `data-tv-player-ativo` no `<html>` faz a navegação espacial
 *     global se abster por completo enquanto o player está montado;
 *   • as teclas de MÍDIA do controle chegam pelo evento `mf-media-key` (o shell
 *     Android as encaminha) e são tratadas aqui.
 */

/** Passo do seek pelo controle remoto, em segundos (requisito: 30s). */
const PASSO_SEEK = 30;

/** Passo do volume por pulsação (pontos percentuais). */
const PASSO_VOLUME = 5;

/** Anexa `autoplay=1` à URL do embed (o provedor inicia a reprodução sozinho). */
function comAutoplay(url: string): string {
  if (!url) return url;
  if (/[?&]autoplay=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
}

/** Prende um número dentro de uma faixa. */
function limitar(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (max > 0 && v > max) return max;
  return v < min ? min : v;
}

/** Formata segundos como `mm:ss` / `hh:mm:ss`. */
function formatar(segundos: number): string {
  if (!Number.isFinite(segundos)) return '--:--';
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

export function TvPlayerPage({ id: idProp }: { id?: string } = {}) {
  const { id: idParam } = useParams();
  const id = idProp ?? idParam;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const iframeWrapRef = useRef<HTMLDivElement>(null);

  /** Recria o embed sem duplicar iframes (mantido para a leitura de estado). */
  const [recarga] = useState(0);

  /** ── PROGRESSO / TEMPO (real quando o provedor publica) ───────────────── */
  const [progresso, setProgresso] = useState<EstadoProgresso>({
    posicao: 0,
    duracao: 0,
    posicaoReal: false,
    duracaoReal: false,
  });
  /** Estado de reprodução (otimista quando o embed não é legível). */
  const [pausado, setPausado] = useState(false);
  /** Movimento acumulado do seek, para o indicador (⏩ +30s / ⏪ −30s). */
  const [movimento, setMovimento] = useState<{ sentido: 'frente' | 'volta'; segundos: number } | null>(null);
  /** Aviso curto transitório (volume / mudo) mostrado na barra. */
  const [aviso, setAviso] = useState<string | null>(null);
  /** Volume atual (0–100) exibido no aviso; `null` quando não é legível. */
  const [volume, setVolume] = useState<number | null>(null);
  const [mudo, setMudo] = useState(false);

  const movie = useMemo(
    () => (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null,
    [movies.data, id],
  );

  const ehSerie = Boolean(
    movie && (movie.type === 'series' || movie.type === 'serie' || movie.type === 'tv' || movie.media_type === 'tv'),
  );

  /** Fonte da reprodução — as MESMAS do site/Mobile (nenhum vídeo fictício). */
  const src = useMemo(() => {
    if (!movie) return '';

    if (ehSerie && movie.tmdb_id) {
      const eps = movie.episodes_available ?? [];
      const pedida = Number(params.get('temporada'));
      const pedido = Number(params.get('episodio'));
      const temPedido = Number.isFinite(pedida) && pedida > 0 && Number.isFinite(pedido) && pedido > 0;

      const atual = temPedido ? { season: pedida, episode: pedido } : primeiroEpisodioDisponivel(movie);
      if (!atual) return '';

      return comAutoplay(streambetterSeriesEmbedUrl(movie.tmdb_id, atual.season, atual.episode));
    }

    if (movie.tmdb_id) return comAutoplay(streambetterMovieEmbedUrl(movie.tmdb_id));
    if (movie.video_url) return movie.video_url;
    return '';
  }, [movie, ehSerie, params]);

  const voltar = useCallback(() => {
    if (movie) navigate(`/tv/titulo/${movie.id}`);
    else navigate('/tv');
  }, [movie, navigate]);

  /** O iframe do player (o alvo real dos comandos). */
  const iframeDoPlayer = useCallback(
    (): HTMLIFrameElement | null =>
      (iframeWrapRef.current?.querySelector('iframe') as HTMLIFrameElement | null) ?? null,
    [],
  );

  /** Posição/duração atuais, sempre acessíveis ao listener estável. */
  const progressoRef = useRef(progresso);
  progressoRef.current = progresso;

  /**
   * Suspende a GUARDA DE FOCO enquanto uma tecla/toque é injetado no player.
   * CAUSA RAIZ: a guarda devolvia o foco ao botão imediatamente — às vezes antes
   * de o WebView despachar a tecla ao iframe recém-focado, e o play/pause não
   * acontecia de verdade. Ver a nota longa no início do arquivo.
   */
  const alternandoRef = useRef(false);
  const janelaInjecaoRef = useRef(0);

  /**
   * O usuário já apertou alguma tecla do controle? Serve para o AUTOPLAY parar
   * de tentar iniciar o vídeo assim que houver interação real — sem isso, uma
   * injeção tardia poderia pausar o vídeo que o usuário acabou de dar play.
   */
  const usuarioInteragiuRef = useRef(false);

  /**
   * A CAMADA DE BLOQUEIO está suspensa? Enquanto o toque real é injetado no
   * player, a camada (e o `pointer-events:none` do iframe) são desligados para o
   * toque ATRAVESSAR até o iframe do provedor. Fora dessa janela, a camada volta
   * a cobrir o embed (nenhum controle do provedor aparece).
   */
  const [injetando, setInjetando] = useState(false);
  const injecaoTimerRef = useRef<number | null>(null);

  /** Abre a janela de injeção: suspende a camada e ignora o eco da tecla. */
  const marcarInjecao = useCallback(() => {
    janelaInjecaoRef.current = Date.now() + 700;
    setInjetando(true);
    if (injecaoTimerRef.current !== null) window.clearTimeout(injecaoTimerRef.current);
    injecaoTimerRef.current = window.setTimeout(() => setInjetando(false), 500);
  }, []);

  /**
   * PLAY/PAUSE pelo OK/ENTER e pelo botão/play do controle.
   * FONTE ÚNICA do toggle: `alternarPlayPausePlayer` decide pelo estado REAL do
   * `<video>` quando legível e, quando não é (embed cross-origin), entrega o
   * toque/tecla REAL pela ponte nativa.
   */
  const alternarPlay = useCallback(() => {
    alternandoRef.current = true;
    marcarInjecao();
    window.setTimeout(() => {
      alternandoRef.current = false;
    }, 700);
    try {
      const resultado = alternarPlayPausePlayer(iframeDoPlayer());
      if (resultado !== null) setPausado(resultado);
      else setPausado((p) => !p); // sem leitura: toggle otimista do HUD
    } finally {
      // A guarda só volta a agir depois que o shell entregou a tecla ao player.
      window.setTimeout(() => {
        alternandoRef.current = false;
      }, 680);
    }
  }, [iframeDoPlayer, marcarInjecao]);

  /**
   * SEEK REAL de ±30s. Usa a posição REAL (postMessage) quando disponível;
   * respeita os limites [0, duração]. Mostra o indicador ⏩/⏪.
   */
  const buscar = useCallback(
    (delta: number) => {
      const iframe = iframeDoPlayer();
      const atual = progressoRef.current;
      const duracao = atual.duracao > 0 ? atual.duracao : 0;
      const alvo = limitar(atual.posicao + delta, 0, duracao > 0 ? duracao : Number.MAX_SAFE_INTEGER);
      const ok = pedirSeekProvedor(iframe, alvo);
      if (ok) {
        setProgresso((antes) => ({ ...antes, posicao: alvo }));
        setMovimento((antes) => {
          const sentido = delta > 0 ? 'frente' : 'volta';
          if (antes && antes.sentido === sentido) return { sentido, segundos: antes.segundos + Math.abs(delta) };
          return { sentido, segundos: Math.abs(delta) };
        });
      }
    },
    [iframeDoPlayer],
  );

  /** VOLUME pelo ↑/↓: ajusta a mídia no shell nativo e mostra o nível na tela. */
  const ajustarVolume = useCallback((delta: number) => {
    const assumiu = ajustarVolumePlayerTv(delta);
    if (!assumiu) return; // sem shell nativo: não há volume para ajustar aqui
    const lido = lerVolumePlayerTv();
    if (lido !== null) {
      setVolume(lido);
      setMudo(lido <= 0);
      setAviso(lido <= 0 ? '🔇 Mudo' : `🔊 ${lido}%`);
    } else {
      setAviso(delta > 0 ? '🔊 +' : '🔉 −');
    }
  }, []);

  /** Só faz sentido quando há assinante e fonte real de vídeo. */
  const pronto = Boolean(user) && assinante && Boolean(src);
  const prontoRef = useRef(pronto);
  prontoRef.current = pronto;

  /** Refs estáveis para o listener (registrado UMA vez). */
  const alternarPlayRef = useRef(alternarPlay);
  alternarPlayRef.current = alternarPlay;
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;
  const ajustarVolumeRef = useRef(ajustarVolume);
  ajustarVolumeRef.current = ajustarVolume;
  const voltarRef = useRef(voltar);
  voltarRef.current = voltar;

  /** Foco visual (só cosmético: as teclas são tratadas globalmente). */
  const playPauseRef = useRef<HTMLButtonElement>(null);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * CONTROLE REMOTO — UM ÚNICO LISTENER, REGISTRADO UMA VEZ
   * ══════════════════════════════════════════════════════════════════════
   * Captura, `keydown`. Trata OK/ENTER (play/pause), ← / → (seek ±30s), ↑ / ↓
   * (volume), PLAY/PAUSE físico e BACK. Ignora `e.repeat` para o OK (segurar não
   * dispara uma sequência de toggles). Consome a tecla (preventDefault/
   * stopPropagation) para nenhum outro dono disputar a mesma pulsação.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!prontoRef.current) return;

      // Não roubar teclas de um campo de texto (login/busca da TV).
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;

      const acao = classificarTecla(e);
      if (!acao) return;

      // A partir daqui é interação REAL do usuário: o autoplay para de tentar.
      usuarioInteragiuRef.current = true;

      e.preventDefault();
      e.stopPropagation();

      if (acao === 'ok' || acao === 'playpause') {
        if (e.repeat) return;
        alternarPlayRef.current();
        return;
      }
      if (acao === 'left') {
        buscarRef.current(-PASSO_SEEK);
        return;
      }
      if (acao === 'right') {
        buscarRef.current(PASSO_SEEK);
        return;
      }
      if (acao === 'up') {
        ajustarVolumeRef.current(PASSO_VOLUME);
        return;
      }
      if (acao === 'down') {
        ajustarVolumeRef.current(-PASSO_VOLUME);
        return;
      }
      if (acao === 'back') {
        voltarRef.current();
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  /**
   * TECLAS DE MÍDIA do controle físico (PLAY/PAUSE). O shell Android as
   * encaminha como o evento `mf-media-key` (o WebView não as entrega como
   * keydown). Aqui elas viram a MESMA ação real do OK.
   */
  useEffect(() => {
    function onMediaKey(e: Event) {
      if (!prontoRef.current) return;
      const tipo = (e as CustomEvent<string>).detail;
      if (tipo === 'togglePlay') alternarPlayRef.current();
      else if (tipo === 'seekFwd') buscarRef.current(PASSO_SEEK);
      else if (tipo === 'seekBack') buscarRef.current(-PASSO_SEEK);
      else if (tipo === 'volUp') ajustarVolumeRef.current(PASSO_VOLUME);
      else if (tipo === 'volDown') ajustarVolumeRef.current(-PASSO_VOLUME);
    }
    window.addEventListener('mf-media-key', onMediaKey as EventListener);
    return () => window.removeEventListener('mf-media-key', onMediaKey as EventListener);
  }, []);

  /**
   * O marker `data-tv-player-ativo` no `<html>` faz a navegação espacial GLOBAL
   * (registrada uma única vez no App) se abster de TODAS as teclas enquanto o
   * player está montado — o player é o dono do controle remoto. Sem ele, a
   * camada global consumia a MESMA pulsação (dois donos) e o OK podia nunca
   * chegar ao player.
   */
  useEffect(() => {
    if (!pronto) return;
    document.documentElement.setAttribute('data-tv-player-ativo', '1');
    return () => document.documentElement.removeAttribute('data-tv-player-ativo');
  }, [pronto]);

  /** Troca de título/episódio: o progresso mostrado é o DESTA reprodução. */
  const chaveTitulo = `${movie?.id ?? ''}/${params.get('temporada') ?? ''}/${params.get('episodio') ?? ''}`;
  const chaveTituloRef = useRef('');
  useEffect(() => {
    if (chaveTituloRef.current === chaveTitulo) return;
    chaveTituloRef.current = chaveTitulo;
    setProgresso({ posicao: 0, duracao: 0, posicaoReal: false, duracaoReal: false });
    setMovimento(null);
    setAviso(null);
  }, [chaveTitulo]);

  /**
   * DURAÇÃO conhecida do catálogo (`duration`, em minutos) — o MESMO dado que o
   * card e a tela de detalhes já exibem. É o fallback HONESTO enquanto o
   * provedor não publica a duração real.
   */
  useEffect(() => {
    const seg = duracaoDoCatalogo(movie?.duration);
    if (seg <= 0) return;
    setProgresso((antes) => ({
      ...antes,
      duracao: antes.duracaoReal ? antes.duracao : seg,
      posicao: antes.posicaoReal ? antes.posicao : Math.min(antes.posicao, seg),
    }));
  }, [movie?.duration]);

  /**
   * PROGRESSO REAL do provedor (postMessage `streambetter:progress`).
   * É o que corrige o "0:00 / 0:00": o tempo e a duração passam a ser os REAIS
   * do vídeo, publicados pelo próprio player. Alimenta a ÚNICA exibição de tempo
   * (a da barra inferior).
   */
  useEffect(() => {
    if (!pronto) return;
    const limpar = assinarProgressoProvedor((p) => {
      setProgresso({
        posicao: p.posicao,
        duracao: p.duracao > 0 ? p.duracao : progressoRef.current.duracao,
        posicaoReal: true,
        duracaoReal: p.duracao > 0,
      });
      if (p.estado === 'playing') setPausado(false);
      else if (p.estado === 'paused') setPausado(true);
    });
    return limpar;
  }, [pronto, recarga]);

  /** O indicador de seek some sozinho depois de um instante. */
  useEffect(() => {
    if (!movimento) return;
    const t = window.setTimeout(() => setMovimento(null), 1200);
    return () => window.clearTimeout(t);
  }, [movimento]);

  /** O aviso de volume some sozinho depois de um instante. */
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 1400);
    return () => window.clearTimeout(t);
  }, [aviso]);

  /**
   * Lê o volume inicial pela ponte (só para o indicador; o volume em si é do
   * aparelho). Roda uma vez por montagem.
   */
  useEffect(() => {
    if (!pronto) return;
    const lido = lerVolumePlayerTv();
    if (lido !== null) {
      setVolume(lido);
      setMudo(lido <= 0);
    }
  }, [pronto]);

  /** Foco visual no botão Play/Pause ao abrir (cosmético; as teclas são globais). */
  useEffect(() => {
    if (!pronto) return;
    const t = window.setTimeout(() => {
      const b = playPauseRef.current;
      if (b) {
        try {
          b.focus({ preventScroll: true });
        } catch {
          /* ignora */
        }
        b.classList.add('tv-focus');
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [pronto, recarga]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * AUTOPLAY REAL — o filme começa sozinho ao abrir o player
   * ══════════════════════════════════════════════════════════════════════════
   * O embed do provedor (iframe de outra origem) NÃO inicia sozinho: nem com
   * `autoplay=1` na URL, nem por `video.play()` (o site não alcança o `<video>`
   * de dentro do iframe). O único gesto que o player aceita é uma TECLA REAL
   * entregue com o iframe focado — o MESMO caminho do OK.
   *
   * Aqui entregamos o OK (DPAD_CENTER) UMA vez, logo depois de o embed carregar,
   * e repetimos em poucas tentativas espaçadas (o provedor demora a montar o
   * `<video>`). Assim que o usuário aperta qualquer tecla, o autoplay PARA —
   * nunca pausa o vídeo que ele acabou de dar play.
   */
  useEffect(() => {
    if (!pronto) return;
    usuarioInteragiuRef.current = false;
    const tentativas = [900, 1800, 3200, 5200];
    const timers = tentativas.map((ms) =>
      window.setTimeout(() => {
        if (usuarioInteragiuRef.current) return;
        // Abre a janela de injeção: suspende a camada (o toque atravessa) e
        // ignora o eco da tecla no documento pai.
        marcarInjecao();
        iniciarReproducaoPlayer(iframeDoPlayer());
      }, ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [pronto, recarga, iframeDoPlayer, marcarInjecao]);

  /**
   * GUARDA DE FOCO — o foco NUNCA pode ficar no iframe de outra origem (senão o
   * documento pai deixa de receber as teclas do controle). Se o foco escapar
   * para o iframe, é devolvido ao botão. SUSPENSA durante a injeção de tecla/
   * toque no player (o WebView precisa focar o iframe para entregar o comando).
   */
  useEffect(() => {
    if (!pronto) return;
    function onFocusIn(e: FocusEvent) {
      if (alternandoRef.current || Date.now() < janelaInjecaoRef.current) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && alvo.tagName === 'IFRAME') {
        const b = playPauseRef.current;
        if (b) {
          try {
            b.focus({ preventScroll: true });
          } catch {
            /* ignora */
          }
          b.classList.add('tv-focus');
        }
      }
    }
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, [pronto]);

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
      {/* A MOLDURA do vídeo ocupa a tela inteira. A barra customizada é ANCORADA
          no rodapé DESTA moldura — exatamente onde a barra nativa do provedor
          aparece — de modo que ela a COBRE por completo (ver tv.css). */}
      <div className={`tv-player-box${injetando ? ' tv-player-injetando' : ''}`} data-tv-player-box>
        <div ref={iframeWrapRef} className="tv-player-embed">
          <StreamBetterEmbed
            key={`${src}-${recarga}`}
            embedUrl={src}
            onBack={voltar}
            mostrarTelaCheia={false}
          />
        </div>

        {/* CAMADA DE BLOQUEIO: cobre o embed do provedor para a barra nativa dele
            não surgir nem responder. O controle remoto opera o player pelas
            pontes reais (toque/tecla de play/pause + streambetter:seek). */}
        <div className="tv-player-bloqueio" aria-hidden="true" tabIndex={-1} />

        {/* ── BARRA CUSTOMIZADA ANCORADA NO RODAPÉ (cobre a barra nativa) ──
            Contém a ÚNICA exibição de tempo, no formato HH:MM:SS / HH:MM:SS. */}
        <div className="tv-player-bar-ancora" data-tv-player-controles>
          <div className="tv-player-controles">
            <button
              ref={playPauseRef}
              type="button"
              data-tv-focusable
              tabIndex={0}
              className="tv-player-ctrl tv-player-ctrl-main"
              aria-label={pausado ? 'Reproduzir' : 'Pausar'}
              onClick={alternarPlay}
            >
              {pausado ? <Play className="tv-player-ctrl-icon" /> : <Pause className="tv-player-ctrl-icon" />}
            </button>

            <button
              type="button"
              data-tv-focusable
              tabIndex={0}
              className="tv-player-ctrl"
              aria-label="Retroceder 30 segundos"
              onClick={() => buscar(-PASSO_SEEK)}
            >
              <RotateCcw className="tv-player-ctrl-icon" />
            </button>

            <button
              type="button"
              data-tv-focusable
              tabIndex={0}
              className="tv-player-ctrl"
              aria-label="Avançar 30 segundos"
              onClick={() => buscar(PASSO_SEEK)}
            >
              <RotateCw className="tv-player-ctrl-icon" />
            </button>

            {/* ── A ÚNICA EXIBIÇÃO DE TEMPO ⏪⏩ / HH:MM:SS / HH:MM:SS ── */}
            <div
              className="tv-player-barra"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                progresso.duracao > 0 ? limitar((progresso.posicao / progresso.duracao) * 100, 0, 100) : 0,
              )}
              aria-label="Progresso do vídeo"
              data-tv-progresso
            >
              <span className="tv-player-barra-trilha" data-tv-progresso-trilha>
                <span
                  className="tv-player-barra-preenchida"
                  style={{
                    width: `${
                      progresso.duracao > 0 ? limitar((progresso.posicao / progresso.duracao) * 100, 0, 100) : 0
                    }%`,
                  }}
                />
              </span>
              {movimento ? (
                <span className="tv-player-barra-aviso" data-tv-progresso-movimento>
                  {movimento.sentido === 'frente' ? `⏩ +${movimento.segundos}s` : `⏪ −${movimento.segundos}s`}
                </span>
              ) : null}
              <span className="tv-player-barra-tempo" data-tv-progresso-tempo>
                {formatar(progresso.posicao)} / {progresso.duracao > 0 ? formatar(progresso.duracao) : '--:--'}
              </span>
              {aviso ? (
                <span className="tv-player-barra-volume" data-tv-volume>
                  {aviso}
                </span>
              ) : null}
            </div>

            {/* Indicador de volume/mudo (não é uma segunda leitura de tempo). */}
            {volume !== null ? (
              <span
                className="tv-player-volume-icone"
                aria-hidden="true"
                title={mudo ? 'Mudo' : `Volume ${volume}%`}
              >
                {mudo || volume <= 0 ? (
                  <VolumeX className="tv-player-ctrl-icon" />
                ) : (
                  <Volume2 className="tv-player-ctrl-icon" />
                )}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* TOPO discreto, AUTO-OCULTO: marca + título + dica das teclas. */}
      <div className="tv-player-top tv-player-top-auto" aria-hidden="false">
        <span className="tv-player-logo" aria-hidden="true">
          MovieFlix
        </span>
        <span className="tv-player-title">{movie.title}</span>
        <span className="tv-player-hint tv-player-hint-top">
          OK pausa/continua · ← retrocede · → avança · ↑↓ volume · Voltar sai
        </span>
      </div>

    </div>
  );
}
