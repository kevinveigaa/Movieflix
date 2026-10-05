import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * MovieFlix TV — ESTADO REAL DO `<video>` DO PLAYER (hook).
 * ══════════════════════════════════════════════════════════════════════════════
 * REQUISITO: "o estado de play/pause deve refletir o estado REAL do vídeo
 * (`video.paused`), não um booleano paralelo, e a interface deve indicar
 * visualmente o estado atual (ícone PLAY quando pausado, PAUSE quando tocando)".
 *
 * ── HONESTIDADE (o que este hook NÃO faz) ────────────────────────────────────
 * No MovieFlix TV a reprodução vive no embed OFICIAL do provedor, dentro de um
 * IFRAME DE OUTRA ORIGEM. A política de mesma origem impede ler `video.paused`
 * ali dentro — nesse caso o hook devolve `legivel: false` e NÃO inventa um
 * estado. Quem chama decide o fallback (o toggle otimista do controle), como já
 * era feito. Quando o player é da MESMA origem (player HLS nativo
 * `video[data-mf-player]`, ou um embed que exponha o vídeo), o estado é lido
 * DIRETO do elemento e acompanha os eventos reais.
 *
 * ── EVENTOS TRATADOS ─────────────────────────────────────────────────────────
 * `play`, `pause`, `ended`, `error`, `canplay`, `loadedmetadata`, `timeupdate`,
 * `volumechange` — todos registrados no MESMO lugar e removidos no cleanup.
 * Nenhum listener é recriado a cada renderização: o efeito depende apenas de
 * `recarga` (quando o embed é remontado) e do wrapper.
 */

/** Estado resolvido do player para a interface. */
export interface EstadoVideo {
  /** O `<video>` é legível (mesma origem)? Quando `false`, o estado é desconhecido. */
  legivel: boolean;
  /** O vídeo está pausado? (só confiável quando `legivel`). */
  pausado: boolean;
  /** O vídeo terminou? */
  terminou: boolean;
  /** Houve erro de reprodução? */
  erro: boolean;
  /** Posição atual em segundos (0 quando não legível). */
  posicao: number;
  /** Duração total em segundos (0 quando desconhecida). */
  duracao: number;
  /** Volume 0–1 (só confiável quando legível). */
  volume: number;
  /** Está no mudo? */
  mudo: boolean;
}

const INICIAL: EstadoVideo = {
  legivel: false,
  pausado: false,
  terminou: false,
  erro: false,
  posicao: 0,
  duracao: 0,
  volume: 1,
  mudo: false,
};

/**
 * Localiza o `<video>` do player quando ele é alcançável pelo JS.
 *
 * Ordem: (1) o vídeo nativo do MovieFlix (`video[data-mf-player]`); (2) o vídeo
 * dentro do iframe, quando o iframe é da MESMA origem. Devolve `null` no caso
 * normal do embed cross-origin — e aí o estado é declarado ilegível.
 */
export function localizarVideo(
  iframe: HTMLIFrameElement | null | undefined,
): HTMLVideoElement | null {
  try {
    const nativo = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
    if (nativo) return nativo;
  } catch {
    /* sem DOM: segue */
  }
  try {
    const interno = iframe?.contentDocument?.querySelector<HTMLVideoElement>('video');
    if (interno) return interno;
  } catch {
    /* cross-origin: inalcançável */
  }
  return null;
}

/**
 * Lê o estado do `<video>` AGORA (sem esperar evento).
 * Devolve `null` quando o vídeo não é legível.
 */
export function lerEstadoVideo(video: HTMLVideoElement | null): EstadoVideo | null {
  if (!video) return null;
  try {
    return {
      legivel: true,
      pausado: video.paused,
      terminou: video.ended === true,
      erro: video.error != null,
      posicao: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duracao: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0,
      volume: Number.isFinite(video.volume) ? video.volume : 1,
      mudo: video.muted === true,
    };
  } catch {
    return null;
  }
}

/**
 * Assina o estado REAL do `<video>` do player.
 *
 * @param iframeWrapRef wrapper que contém o iframe do embed
 * @param recarga       muda quando o embed é remontado (força re-varredura)
 */
export function useEstadoVideoPlayer(
  iframeWrapRef: RefObject<HTMLElement | null>,
  recarga: number,
): {
  estado: EstadoVideo;
  /** Relê o estado agora (usado logo após um comando, para o ícone não atrasar). */
  reler: () => EstadoVideo;
  /** Toca o vídeo tratando a Promise (respeita `ended`). */
  tocar: () => void;
  /** Pausa o vídeo. */
  pausar: () => void;
} {
  const [estado, setEstado] = useState<EstadoVideo>(INICIAL);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const reler = useCallback((): EstadoVideo => {
    const lido = lerEstadoVideo(videoRef.current);
    if (lido) {
      setEstado(lido);
      return lido;
    }
    return INICIAL;
  }, []);

  useEffect(() => {
    let vivo = true;
    let video: HTMLVideoElement | null = null;

    const atualizar = () => {
      if (!vivo) return;
      const lido = lerEstadoVideo(video);
      if (lido) setEstado(lido);
    };

    /**
     * O iframe do embed pode montar DEPOIS deste efeito (o provedor demora).
     * Uma varredura curta e limitada encontra o vídeo quando ele aparece — sem
     * timer perpétuo e sem recriar listeners.
     */
    let tentativas = 0;
    const procurar = () => {
      if (!vivo) return;
      const iframe = iframeWrapRef.current?.querySelector('iframe') ?? null;
      const achado = localizarVideo(iframe);
      if (achado) {
        video = achado;
        videoRef.current = achado;
        // Eventos REAIS do elemento — registrados UMA vez, removidos no cleanup.
        achado.addEventListener('play', atualizar);
        achado.addEventListener('pause', atualizar);
        achado.addEventListener('ended', atualizar);
        achado.addEventListener('error', atualizar);
        achado.addEventListener('canplay', atualizar);
        achado.addEventListener('loadedmetadata', atualizar);
        achado.addEventListener('timeupdate', atualizar);
        achado.addEventListener('volumechange', atualizar);
        atualizar();
        return;
      }
      tentativas += 1;
      if (tentativas < 40) window.setTimeout(procurar, 250);
      else if (vivo) setEstado(INICIAL); // embed cross-origin: estado ilegível
    };

    procurar();

    return () => {
      vivo = false;
      if (video) {
        video.removeEventListener('play', atualizar);
        video.removeEventListener('pause', atualizar);
        video.removeEventListener('ended', atualizar);
        video.removeEventListener('error', atualizar);
        video.removeEventListener('canplay', atualizar);
        video.removeEventListener('loadedmetadata', atualizar);
        video.removeEventListener('timeupdate', atualizar);
        video.removeEventListener('volumechange', atualizar);
      }
      videoRef.current = null;
    };
  }, [iframeWrapRef, recarga]);

  /** Toca o vídeo tratando a Promise e respeitando o fim do vídeo. */
  const tocar = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.ended === true) return; // finalizado: não reinicia por engano
    try {
      const p = v.play();
      if (p !== undefined) p.catch(() => undefined);
    } catch {
      /* autoplay bloqueado: o usuário pode tentar de novo */
    }
  }, []);

  const pausar = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
    } catch {
      /* ignora */
    }
  }, []);

  return { estado, reler, tocar, pausar };
}
