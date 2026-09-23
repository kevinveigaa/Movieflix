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

/** Intervalo do SEEK CONTÍNUO enquanto a tecla permanece pressionada (ms). */
const PASSO_CONTINUO_MS = 350;

/**
 * Tecla DIRECIONAL do controle remoto.
 *
 * Aceita tanto os nomes do navegador quanto os keyCodes crus do Android TV / TV
 * Box (19-22), porque muitas TVs entregam `e.key === 'Unidentified'`.
 */
function direcaoDaTecla(e: KeyboardEvent): 'left' | 'right' | 'up' | 'down' | null {
  const k = e.key;
  const c = e.keyCode || e.which;
  if (k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21) return 'left';
  if (k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22) return 'right';
  if (k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19) return 'up';
  if (k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20) return 'down';
  return null;
}

/**
 * OK / ENTER / SELECIONAR do controle remoto.
 *
 * Inclui NUMPAD_ENTER (66) de propósito: é o keyCode que a maioria dos TV Box
 * envia no botão central, e ele ficava de FORA das listas de teclas — um dos
 * motivos de o OK "não fazer nada" sobre os botões do player.
 */
function ehOkDoControle(e: KeyboardEvent): boolean {
  const k = e.key;
  const c = e.keyCode || e.which;
  return (
    k === 'Enter' || k === 'OK' || k === 'Select' || c === 13 || c === 23 || c === 32 || c === 66
  );
}

/**
 * Teclas de MÍDIA do controle remoto (play/pause, ⏪, ⏩, próximo, anterior).
 *
 * CAUSA RAIZ (relato: "pausar/retomar/avançar/retroceder não respondem ao
 * controle remoto"): estas teclas estão em `TECLAS_PLAYER`, ou seja, a página as
 * PEDE ao shell nativo para que cheguem ao WebView como `keydown` — e, por isso
 * mesmo, o shell deixa de emitir o evento `mf-media-key` para elas (o shell só
 * emite esse evento para as teclas que ele mesmo consome, como VOLUME/MUDO).
 * Só que este handler não conhecia os keyCodes de mídia: a tecla chegava à
 * página e era simplesmente IGNORADA. Era o caso exato do botão PLAY/PAUSE e
 * dos botões ⏪/⏩ do controle — enquanto o volume/mudo continuava funcionando,
 * porque aqueles o shell consome e avisa pelo `mf-media-key` (tratado em
 * `onMediaKey`).
 *
 * Aqui as duas pontas se encontram: a página passa a tratar os keyCodes de
 * mídia que ela mesma pediu, e o evento `mf-media-key` continua valendo para o
 * que o shell consome. Cada tecla tem UM único caminho — nunca os dois.
 *
 * O keyCode só é aceito quando `e.key` NÃO é um caractere digitável: assim a
 * letra "u" do teclado de um computador (keyCode 85) nunca é confundida com o
 * botão PLAY/PAUSE de um controle.
 */
function teclaDeMidia(
  e: KeyboardEvent,
): 'togglePlay' | 'seekFwd' | 'seekBack' | 'next' | 'prev' | 'stop' | null {
  const k = e.key;
  if (k === 'MediaPlayPause' || k === 'PlayPause' || k === 'MediaPlay' || k === 'MediaPause') {
    return 'togglePlay';
  }
  if (k === 'MediaFastForward') return 'seekFwd';
  if (k === 'MediaRewind') return 'seekBack';
  if (k === 'MediaTrackNext') return 'next';
  if (k === 'MediaTrackPrevious') return 'prev';
  if (k === 'MediaStop') return 'stop';

  // Android TV / TV Box: `e.key` costuma chegar como "Unidentified" e apenas o
  // keyCode identifica a tecla.
  const semCaractere = !k || k.length > 1;
  if (!semCaractere) return null;
  const c = e.keyCode || e.which;
  if (c === 85 || c === 126 || c === 127) return 'togglePlay';
  if (c === 90) return 'seekFwd';
  if (c === 89) return 'seekBack';
  if (c === 87) return 'next';
  if (c === 88) return 'prev';
  if (c === 86) return 'stop';
  return null;
}

/**
 * TECLAS QUE A CAMADA NATIVA PRECISA "SOLTAR" PARA A PÁGINA.
 *
 * CAUSA RAIZ do defeito relatado ("os botões do player não respondem ao
 * controle remoto"): o shell Android de TV (`MainActivity.dispatchKeyEvent`)
 * consumia o D-pad e as teclas de mídia ANTES do WebView, com `return true`.
 * No navegador isso passa despercebido (o site navega por teclado), mas DENTRO
 * DO APP as setas/OK/mídia nunca chegavam à página: o foco não se movia entre os
 * botões da barra e o OK não virava clique — os controles pareciam mortos.
 *
 * Aqui o PLAYER diz ao shell quais teclas ele quer receber. A liberação dura
 * apenas enquanto esta tela está montada: fora do player as teclas continuam
 * com o comportamento nativo (Voltar hierárquico e saída do app) intacto.
 */
const TECLAS_PLAYER = [
  19, // DPAD_UP
  20, // DPAD_DOWN
  21, // DPAD_LEFT
  22, // DPAD_RIGHT
  23, // DPAD_CENTER (OK)
  66, // NUMPAD_ENTER (OK de vários TV Box)
  // ── AS TECLAS DE MÍDIA **NÃO** ENTRAM AQUI (correção da 5.0.1) ─────────────
  //
  // CAUSA RAIZ de "pausar, retomar, avançar e retroceder não respondem ao
  // controle remoto": na 5.0.0 as teclas de mídia foram incluídas nesta lista.
  // Pedir uma tecla ao shell significa que o shell DEIXA de consumi-la — e é
  // justamente AO consumi-la que ele emite o evento `mf-media-key` que o player
  // já tratava (`onMediaKey`). Com a tecla liberada, ela passou a chegar à
  // página como um `keydown` cru (e o Chromium do WebView nem sempre converte
  // MEDIA_* em evento de teclado), e o handler da página não conhecia aqueles
  // keyCodes: a tecla morria no caminho, sem play/pause e sem seek.
  // O volume/mudo continuou funcionando porque NUNCA saiu do shell — é o shell
  // que ajusta o áudio do aparelho e avisa a página por `mf-media-key`.
  //
  // Fix: esta lista volta a conter APENAS o que a página precisa receber como
  // telado (D-pad + OK). As teclas de mídia retornam ao caminho que já
  // funcionava (shell consome → `mf-media-key`). Cada tecla passa a ter UM
  // único caminho — nunca os dois —, então não há ação dupla.
  //
  // BACK NÃO entra: o shell já tem a hierarquia de Voltar (fechar controles →
  // voltar ao detalhe) e mantê-la nativa preserva o comportamento atual.
];

/** Avisa a camada nativa (Android TV) quais teclas devem chegar à página. */
function definirTeclasNativas(codes: number[]): void {
  try {
    const w = window as unknown as {
      MovieFlixApp?: { setTeclasNavegacao?: (on: boolean, c: number[]) => void };
      MovieFlixAndroid?: { setTeclasNavegacao?: (on: boolean, c: number[]) => void };
    };
    const ponte = w.MovieFlixApp ?? w.MovieFlixAndroid;
    ponte?.setTeclasNavegacao?.(codes.length > 0, codes);
  } catch {
    /* fora do app nativo: o navegador já entrega as teclas normalmente */
  }
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
   * Envia um comando para o player embutido. Os embeds de provedor escutam
   * `postMessage` na janela do iframe; enviamos o formato genérico que os
   * players HTML5 (e o próprio StreamBetter) reconhecem, de forma tolerante.
   *
   * IMPORTANTE — HONESTIDADE: se o provedor não aceitar comandos externos (é
   * comum, por segurança), o comando NÃO faz efeito. Por isso o seek também é
   * oferecido pelos controles nativos do embed, e o volume é resolvido pelo
   * áudio do APARELHO (que funciona de verdade em qualquer provedor).
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

  /**
   * Alterna play/pause.
   *
   * O estado é lido por REF (`emReproducaoRef`) em vez do atualizador funcional
   * do `useState`: o `mostrarAviso` abaixo dá o feedback na tela (⏸/▶) e não
   * pode ser chamado dentro do atualizador — o React pode executá-lo duas vezes
   * em StrictMode e o aviso apareceria/desapareceria em dobro.
   */
  const emReproducaoRef = useRef(true);

  const alternarPlay = useCallback(() => {
    const proximoEstado = !emReproducaoRef.current;
    emReproducaoRef.current = proximoEstado;
    setEmReproducao(proximoEstado);
    comandarPlayer(proximoEstado ? 'play' : 'pause');
    mostrarAviso(proximoEstado ? '▶ Reproduzindo' : '⏸ Pausado');
  }, [comandarPlayer, mostrarAviso]);

  /** Seek pelo controle: avança/retrocede e mostra o passo no aviso. */
  const seek = useCallback(
    (frente: boolean) => {
      comandarPlayer(frente ? 'seekFwd' : 'seekBack');
      mostrarAviso(frente ? `⏩ +${PASSO_SEEK}s` : `⏪ −${PASSO_SEEK}s`);
    },
    [comandarPlayer, mostrarAviso],
  );

  /**
   * SEEK CONTÍNUO — "segurar para frente/para trás".
   *
   * CAUSA RAIZ (relato: "avançar e retroceder não respondem ao controle"): o
   * seek era UM passo por pulsação e não havia nenhum tratamento da REPETIÇÃO
   * da tecla. Segurar ⏪/⏩ (ou ←/→) não produzia movimento contínuo — que é o
   * comportamento esperado de um controle remoto de TV.
   *
   * Agora a primeira pulsação dá o passo imediatamente e, enquanto a tecla
   * continuar pressionada, o passo se REPETE a cada `PASSO_CONTINUO_MS`; o
   * `keyup` (ou o blur, ou a saída da tela) interrompe o movimento.
   *
   * O intervalo é dirigido por NÓS, e não pelo auto-repeat do teclado, porque o
   * auto-repeat varia por fabricante de TV Box — assim o comportamento é o
   * mesmo em qualquer aparelho (e é verificável por teste automatizado).
   */
  const segurarRef = useRef<number | null>(null);

  const pararSegurar = useCallback(() => {
    if (segurarRef.current !== null) {
      window.clearInterval(segurarRef.current);
      segurarRef.current = null;
    }
  }, []);

  const iniciarSegurar = useCallback(
    (frente: boolean) => {
      pararSegurar();
      seek(frente);
      segurarRef.current = window.setInterval(() => seek(frente), PASSO_CONTINUO_MS);
    },
    [seek, pararSegurar],
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

  // ── CONTRATO DE TECLAS COM A CAMADA NATIVA (Android TV) ──────────────────
  //
  // CAUSA RAIZ do bug relatado (ver `TECLAS_PLAYER` no topo do arquivo): o shell
  // nativo consumia o D-pad e as teclas de mídia antes de o WebView recebê-las,
  // então os botões do player não respondiam ao controle remoto. Aqui a tela de
  // reprodução PEDE essas teclas e as DEVOLVE ao sair (a limpeza roda no unmount
  // e no `pagehide`), de modo que o resto do app mantém o comportamento nativo —
  // inclusive o Voltar hierárquico e a saída do app.
  useEffect(() => {
    definirTeclasNativas(TECLAS_PLAYER);
    const devolver = () => definirTeclasNativas([]);
    window.addEventListener('pagehide', devolver);
    return () => {
      window.removeEventListener('pagehide', devolver);
      devolver();
    };
  }, []);

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

    /**
     * O foco está DENTRO da barra de controles (num dos botões dela)?
     *
     * A barra é IRMÃ da caixa do vídeo, não filha: por isso `focoNoPlayer()` é
     * falso com o foco num botão da barra, e a decisão precisa ser feita aqui.
     */
    function focoNaBarra(): boolean {
      const ativo = document.activeElement as HTMLElement | null;
      return !!ativo && !!ativo.closest?.('.tv-player-controls');
    }

    /** Botões VISÍVEIS da barra, na ordem em que aparecem na tela. */
    function botoesDaBarra(): HTMLButtonElement[] {
      const barra = document.querySelector('.tv-player-controls');
      if (!barra) return [];
      return Array.from(barra.querySelectorAll<HTMLButtonElement>('button')).filter(
        (b) => b.getBoundingClientRect().width > 0,
      );
    }

    /** Move o foco entre os botões da barra (Δ = −1 ou +1), em ciclo. */
    function moverFocoBarra(delta: number) {
      const lista = botoesDaBarra();
      if (lista.length === 0) return;
      const atual = document.activeElement as HTMLElement | null;
      const i = atual ? lista.indexOf(atual as HTMLButtonElement) : -1;
      const base = i < 0 ? 0 : (i + delta + lista.length) % lista.length;
      lista[base]?.focus({ preventScroll: true });
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

      // ── TECLAS DE MÍDIA DO CONTROLE (play/pause, ⏪, ⏩, próximo) ──────────
      //
      // CAUSA RAIZ: ver `teclaDeMidia` no topo do arquivo. Estas teclas estão em
      // `TECLAS_PLAYER`, então o shell as entrega ao WebView como `keydown` e
      // NÃO emite `mf-media-key` para elas — mas este handler não conhecia os
      // keyCodes de mídia, e a tecla era IGNORADA. É o defeito exato de "pausar,
      // retomar, avançar e retroceder não respondem ao controle": o botão
      // PLAY/PAUSE e as teclas ⏪/⏩ do controle não faziam nada, enquanto
      // volume/mudo (consumidos pelo shell) continuavam funcionando.
      //
      // Aqui a tecla passa a agir de verdade, e ⏪/⏩ SEGURADAS fazem seek
      // contínuo (mesmo mecanismo do ←/→: `iniciarSegurar`).
      const midia = teclaDeMidia(e);
      if (midia) {
        e.preventDefault();
        e.stopPropagation();
        if (midia === 'togglePlay') {
          alternarPlay();
        } else if (midia === 'seekFwd') {
          if (!e.repeat) iniciarSegurar(true);
        } else if (midia === 'seekBack') {
          if (!e.repeat) iniciarSegurar(false);
        } else if (midia === 'next') {
          if (proximo) proximoEpisodio();
        } else if (midia === 'prev') {
          seek(false);
        } else if (midia === 'stop') {
          voltar();
        }
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

      // ══════════════════════════════════════════════════════════════════════
      // CAUSA RAIZ DO RELATO ("pausar/retomar/avançar/retroceder não respondem
      // ao controle remoto, embora respondam ao clique") — 5.0.1.
      //
      // A barra de controles é IRMÃ da caixa do vídeo (não filha dela). Com a
      // barra ABERTA e o foco num dos botões, este handler tratava o foco como
      // se ele estivesse "no player" e:
      //   • as SETAS caíam em `if (estadosRef.current.controles) return;` — o
      //     foco não andava, então era impossível sair do play/pause e alcançar
      //     ⏪ / ⏩ pela navegação por controle;
      //   • o OK era engolido pelo temporizador de long-press (pin), com o
      //     `return` logo abaixo — o botão focado NUNCA era acionado;
      //   • o NUMPAD_ENTER (66) do botão central de TV Box não constava de
      //     nenhuma lista de OK — o OK simplesmente não existia para a página.
      // Como o clique do mouse aciona o `onClick` direto, os mesmos botões
      // funcionavam no navegador e pareciam mortos no controle remoto.
      //
      // CORREÇÃO (mínima e cirúrgica, só dentro do player):
      //   • o foco andando dentro da barra → as setas movem o foco entre os
      //     botões (se a navegação espacial global já o moveu, não agimos de
      //     novo: nada de passo duplo);
      //   • o OK aciona o botão focado — e, num botão de avançar/retroceder,
      //     SEGURAR o OK liga o seek contínuo (solta e para);
      //   • NUMPAD_ENTER (66) passa a ser reconhecido como OK.
      // Fora da barra nada muda: com o foco no vídeo, ←/→/↑/↓ seguem com o
      // comportamento de sempre (seek, configurações, abrir os controles).
      // ══════════════════════════════════════════════════════════════════════
      if (focoNaBarra()) {
        // A navegação espacial global (registrada antes) já tratou a tecla?
        // Então não agimos de novo — evita mover o foco duas vezes ou disparar
        // um clique duplo.
        if (e.defaultPrevented) return;

        const dir = direcaoDaTecla(e);
        if (dir) {
          e.preventDefault();
          e.stopPropagation();
          moverFocoBarra(dir === 'left' || dir === 'up' ? -1 : 1);
          return;
        }

        if (ehOkDoControle(e)) {
          const alvo = document.activeElement as HTMLElement | null;
          if (alvo && alvo.tagName === 'BUTTON') {
            e.preventDefault();
            e.stopPropagation();
            const sentido = alvo.dataset.tvSeek;
            if (sentido === 'fwd') iniciarSegurar(true);
            else if (sentido === 'back') iniciarSegurar(false);
            else alvo.click();
          }
          return;
        }
        return;
      }

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

      // ── Setas com a barra ABERTA mas o foco FORA dela ─────────────────────
      // Devolve o foco ao controle principal da barra. O foco é SEMPRE visível
      // (requisito do controle remoto): o usuário nunca fica sem saber onde está
      // e nunca precisa de um clique no escuro para "voltar" aos controles.
      if (estadosRef.current.controles) {
        if (direcaoDaTecla(e)) {
          e.preventDefault();
          e.stopPropagation();
          (ctrlMainRef.current ?? botoesDaBarra()[0])?.focus({ preventScroll: true });
        }
        return;
      }

      // Com o foco FORA do player, as setas pertencem à navegação da página.
      if (!focoNoPlayer()) return;

      const esquerda = k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21;
      const direita = k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22;
      const cima = k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19;
      const baixo = k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20;

      // SEEK CONTÍNUO: a 1ª pulsação retrocede/avança e, se a tecla continuar
      // pressionada, o movimento prossegue até soltar (ver `iniciarSegurar`).
      // O auto-repeat do teclado é ignorado de propósito — quem cadencia o
      // passo é o nosso intervalo, igual em qualquer aparelho.
      if (esquerda) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) iniciarSegurar(false);
        return;
      }
      if (direita) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) iniciarSegurar(true);
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
      // Soltar a tecla PARA o seek contínuo (o OK solto para o seek dos
      // botões ⏪/⏩ da barra e ⏪/⏩/←/→ segurados no vídeo).
      if (direcaoDaTecla(e) || ehOkDoControle(e) || teclaDeMidia(e)) pararSegurar();
    }

    window.addEventListener('mf-media-key', onMediaKey as EventListener);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('mf-media-key', onMediaKey as EventListener);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      cancelarLongo();
      pararSegurar();
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
    iniciarSegurar,
    pararSegurar,
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
              data-tv-seek="back"
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
              data-tv-seek="fwd"
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