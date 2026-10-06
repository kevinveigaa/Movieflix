/**
 * MovieFlix TV — PONTE DE CONTROLE DO PLAYER (controle remoto → player do provedor)
 * ═══════════════════════════════════════════════════════════════════════════
 * Este módulo concentra os comandos que o controle remoto manda para o player:
 *   • OK/ENTER → play/pause REAL do vídeo;
 *   • ← / →     → retroceder/avançar ±30s REAIS (via `progressoReal.ts`);
 *   • ↑ / ↓     → volume do aparelho (camada nativa, ver `ajustarVolumePlayerTv`).
 *
 * ── CAUSA RAIZ DO PLAY/PAUSE QUE "não funcionava" (medida) ───────────────
 * O player do provedor (StreamBetter) vive num IFRAME DE OUTRA ORIGEM e ainda
 * fica coberto por uma camada de bloqueio que desliga o ponteiro para esconder
 * a barra nativa. Fatos:
 *  1. uma tecla CHEGA ao documento do iframe quando — e somente quando — o
 *     próprio `<iframe>` é o `document.activeElement`;
 *  2. eventos sintéticos de JavaScript NUNCA atravessam a fronteira de origem;
 *  3. o protocolo `postMessage` documentado do provedor
 *     (https://streambetter.shop/docs) tem APENAS `streambetter:seek` (entrada)
 *     e `streambetter:progress` (saída) — NÃO existe comando de play/pause.
 *
 * Logo, o único caminho que muda o estado do vídeo no aparelho é um EVENTO REAL
 * de entrada entregue pelo WebView. Só a camada nativa Android pode fazer isso —
 * é a ponte `MovieFlixApp` do shell MovieFlix TV (MainActivity.PonteNativa):
 *   • `enviarToquePlayer()` — TOQUE REAL (DOWN+UP) no centro do player. NÃO
 *     depende de foco: o WebView faz hit-testing e entrega ao iframe. É o
 *     caminho PRIMÁRIO (play/pause e autoplay);
 *   • `enviarTeclaPlayer()` — TECLA REAL (DOWN+UP) com o iframe focado. Fica
 *     como FALLBACK para APKs antigos que ainda não têm o toque.
 *
 * ── A CORREÇÃO (por que a rodada anterior falhava em silêncio) ────────────
 * A ponte nativa já existia, mas a chamada falhava na PRÁTICA de duas formas:
 *   A. o `TvPlayerPage` mantinha uma "guarda de foco" que devolvia o foco ao
 *      botão imediatamente — às vezes ANTES de o WebView despachar a tecla ao
 *      iframe recém-focado (a correção #1 é suspender a guarda durante a
 *      injeção);
 *
 * A corretude é HONESTA: quando o `<video>` é legível (mesma origem), o
 * play/pause é feito por `video.play()` / `video.pause()`, e o estado real
 * (`video.paused`) é devolvido. No embed cross-origin, o estado não é legível e
 * a função devolve `null` — quem chama mantém o indicador otimista.
 *
 * Sem ponte (navegador), alternamos o `<video>` de MESMA ORIGEM, se existir. O
 * protocolo `postMessage` do provedor NÃO é usado para play/pause: ele não tem
 * esse comando (mandar um evento inventado só criaria a ILUSÃO de correção).
 */

/** Superfície da ponte nativa do shell Android TV (MainActivity.PonteNativa). */
export interface PontePlayerTv {
  /**
   * Injeta uma TECLA REAL no WebView com o iframe do player focado.
   * Devolve `true` quando a ponte existe e assumiu a entrega.
   */
  enviarTeclaPlayer?: (keyCode: number, key: string) => boolean;
  /**
   * Injeta um TOQUE REAL no centro do player (play/pause e autoplay).
   *
   * É o caminho que funciona no aparelho: o toque NÃO depende de foco (o WebView
   * faz hit-testing e entrega ao iframe do provedor), enquanto a tecla só chega
   * ao iframe quando ele é o `document.activeElement` — foco instável no WebView.
   * Devolve `true` quando a ponte existe e assumiu a entrega.
   */
  enviarToquePlayer?: () => boolean;
  /** Ajusta o volume da mídia em `delta` pontos percentuais (ex.: +5 / -5). */
  ajustarVolume?: (delta: number) => void;
  /** Define o volume absoluto (0–100). */
  definirVolume?: (percentual: number) => void;
  /** Liga/desliga o mudo. */
  definirMudo?: (mudo: boolean) => void;
  /** Volume atual (0–100). */
  lerVolume?: () => number;
}

/** Android KEYCODE_SPACE — tecla que todo player web escuta para play/pause. */
const KEYCODE_SPACE = 32;

/**
 * Android KEYCODE_DPAD_CENTER (23) — o "OK" do controle remoto.
 *
 * É a tecla usada para INICIAR a reprodução no autoplay: o player do provedor
 * (iframe de outra origem) não começa sozinho, e um OK real é o gesto que o
 * aparelho entrega ao player. Diferente do ESPAÇO (que alterna), o OK é o que o
 * usuário apertaria para dar play — e é o que o player espera.
 */
const KEYCODE_DPAD_CENTER = 23;

/** A ponte nativa do player, quando o site roda dentro do APK (senão `null`). */
export function pontePlayerTv(): PontePlayerTv | null {
  try {
    const janela = window as unknown as { MovieFlixApp?: PontePlayerTv };
    const ponte = janela.MovieFlixApp;
    if (!ponte) return null;
    const temAlguma =
      typeof ponte.enviarTeclaPlayer === 'function' || typeof ponte.ajustarVolume === 'function';
    return temAlguma ? ponte : null;
  } catch {
    return null;
  }
}

/** A camada nativa que entrega teclas REAIS ao player está disponível? (só no APK) */
export function temPonteDeTeclasNativa(): boolean {
  const p = pontePlayerTv();
  return !!p && typeof p.enviarTeclaPlayer === 'function';
}

/**
 * ALTERNA a reprodução pelo botão OK/ENTER do controle remoto.
 *
 * Ordem:
 *   1. se o `<video>` é LEGÍVEL (mesma origem), alterna DIRETO pelo estado real
 *      (`video.paused`) e trata a Promise de `play()`;
 *   2. senão (embed do provedor, cross-origin), entrega a TECLA REAL de toggle
 *      (ESPAÇO) pela ponte nativa — o gesto CANÔNICO de play/pause de um player
 *      web e o que ALTERNA (o toque no centro foi medido no aparelho como "só
 *      despausa": quando o vídeo toca, o player trata o toque como "mostrar
 *      controles"/"play", nunca como pausa). Se a ponte não tiver a tecla, cai
 *      no TOQUE REAL. O `TvPlayerPage` suspende a guarda de foco/camada de
 *      bloqueio durante a injeção para o gesto atravessar até o iframe.
 *
 * Parâmetro `mecanismo`: `'tecla'` (padrão, alternância real) ou `'toque'`
 * (usado pelo RETRY verificado do `TvPlayerPage`, quando a tecla não mudou o
 * estado real publicado pelo provedor).
 *
 * @returns o estado que a interface deve mostrar: `true` = pausado. Quando o
 *          estado real não é legível (embed cross-origin), devolve `null` e quem
 *          chama mantém o toggle otimista do HUD.
 */
export type MecanismoToggle = 'tecla' | 'toque';

export function alternarPlayPausePlayer(
  iframe: HTMLIFrameElement | null | undefined,
  ponte: PontePlayerTv | null = pontePlayerTv(),
  mecanismo: MecanismoToggle = 'tecla',
): boolean | null {
  // (1) Vídeo legível (mesma origem): alterna pelo estado REAL.
  try {
    const video =
      iframe?.contentDocument?.querySelector<HTMLVideoElement>('video') ??
      document.querySelector<HTMLVideoElement>('video[data-mf-player]');
    if (video) {
      if (video.ended === true) return true; // finalizado: não reinicia por engano
      if (video.paused) {
        const p = video.play();
        if (p !== undefined) p.catch(() => undefined);
        return false;
      }
      video.pause();
      return true;
    }
  } catch {
    /* cross-origin: inalcançável — segue para a ponte nativa */
  }

  // (2) Embed do provedor (cross-origin): entrega UM ÚNICO gesto REAL pela
  //     ponte nativa. Padrão = TECLA ESPAÇO (o toggle canônico do player).
  //     `mecanismo === 'toque'` = caminho de RETRY do `TvPlayerPage`.
  if (mecanismo === 'toque') {
    try {
      if (ponte?.enviarToquePlayer?.()) return null;
    } catch {
      /* segue para a tecla */
    }
    try {
      if (ponte?.enviarTeclaPlayer?.(KEYCODE_SPACE, 'Space')) return null;
    } catch {
      /* aparelho sem a ponte: nada a fazer */
    }
    return null;
  }

  // TECLA primeiro: é o que ALTERNA de verdade (o toque no centro só despausa).
  try {
    if (ponte?.enviarTeclaPlayer?.(KEYCODE_SPACE, 'Space')) return null;
  } catch {
    /* segue para o toque */
  }
  try {
    if (ponte?.enviarToquePlayer?.()) return null;
  } catch {
    /* aparelho sem a ponte: nada a fazer */
  }
  return null;
}

/**
 * INICIA a reprodução ao abrir o player (autoplay REAL no aparelho).
 *
 * CAUSA RAIZ do "o filme abre em pause e não roda": o embed do provedor vive num
 * IFRAME DE OUTRA ORIGEM e NÃO começa a tocar sozinho — nem com `autoplay=1` na
 * URL, nem por `video.play()` (o site não alcança o `<video>` de dentro do
 * iframe). O único gesto que o player aceita é um EVENTO REAL de entrada — o
 * mesmo caminho do OK.
 *
 * Aqui entregamos um TOQUE REAL no centro do player (fallback: OK/DPAD_CENTER)
 * logo depois de o embed carregar, repetindo em poucas tentativas espaçadas (o
 * provedor demora a montar o `<video>`). O `TvPlayerPage` PARA de tentar assim
 * que o usuário aperta qualquer tecla — nunca pausa o vídeo que ele acabou de
 * dar play.
 *
 * @returns `true` quando um caminho real assumiu o play; `false` quando não há
 *          como iniciar (navegador sem ponte nativa).
 */
export function iniciarReproducaoPlayer(
  iframe: HTMLIFrameElement | null | undefined,
  ponte: PontePlayerTv | null = pontePlayerTv(),
): boolean {
  // (1) Vídeo legível (mesma origem): toca direto pelo estado real.
  try {
    const video =
      iframe?.contentDocument?.querySelector<HTMLVideoElement>('video') ??
      document.querySelector<HTMLVideoElement>('video[data-mf-player]');
    if (video) {
      if (video.ended === true) return true;
      if (video.paused) {
        const p = video.play();
        if (p !== undefined) p.catch(() => undefined);
      }
      return true;
    }
  } catch {
    /* cross-origin: inalcançável — segue para a ponte nativa */
  }

  // (2) Embed do provedor: entrega um TOQUE REAL no centro do player pela ponte
  //     nativa — o gesto que INICIA a reprodução (não depende de foco). Se a
  //     ponte não tiver o toque (APK antigo), cai na TECLA REAL (OK).
  try {
    if (ponte?.enviarToquePlayer?.()) return true;
  } catch {
    /* segue para a tecla */
  }
  try {
    if (ponte?.enviarTeclaPlayer?.(KEYCODE_DPAD_CENTER, 'Enter')) return true;
  } catch {
    /* aparelho sem a ponte: nada a fazer */
  }
  return false;
}

/**
 * Ajusta o VOLUME pelo controle remoto (↑ aumenta, ↓ abaixa).
 *
 * O volume é uma preocupação da CAMADA NATIVA (o que o usuário ouve): a mídia do
 * WebView é ajustada pelo shell Android. Aqui só delegamos para a ponte.
 *
 * @returns `true` quando a ponte assumiu o ajuste; `false` sem shell nativo.
 */
export function ajustarVolumePlayerTv(delta: number, ponte: PontePlayerTv | null = pontePlayerTv()): boolean {
  if (!Number.isFinite(delta) || delta === 0) return false;
  try {
    if (typeof ponte?.ajustarVolume === 'function') {
      ponte.ajustarVolume(delta);
      return true;
    }
  } catch {
    /* shell sem volume: nada a fazer */
  }
  return false;
}

/** Lê o volume atual (0–100) pela ponte, quando disponível. */
export function lerVolumePlayerTv(ponte: PontePlayerTv | null = pontePlayerTv()): number | null {
  try {
    if (typeof ponte?.lerVolume === 'function') {
      const v = ponte.lerVolume();
      return Number.isFinite(v) ? v : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}
