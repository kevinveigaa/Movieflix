/**
 * MovieFlix TV — PONTE DE CONTROLE DO PLAYER (controle remoto → player do provedor)
 * ═══════════════════════════════════════════════════════════════════════════
 * A ÚNICA ação do controle remoto no player é OK/ENTER = play/pause. Este módulo
 * é o ÚNICO ponto de decisão desse toggle.
 *
 * ── CAUSA RAIZ (medida) ───────────────────────────────────────────────────
 * O player do provedor (StreamBetter) vive num IFRAME DE OUTRA ORIGEM. Fatos:
 *  1. uma tecla CHEGA ao documento do iframe quando — e somente quando — o
 *     próprio `<iframe>` é o `document.activeElement`;
 *  2. eventos sintéticos de JavaScript NUNCA atravessam a fronteira de origem;
 *  3. o protocolo `postMessage` documentado do provedor
 *     (https://streambetter.shop/docs) tem APENAS `streambetter:seek` (entrada)
 *     e `streambetter:progress` (saída) — NÃO existe comando de play/pause.
 *
 * Logo, o único caminho que muda o estado do vídeo no aparelho é uma TECLA REAL
 * entregue enquanto o iframe está focado. Só a camada nativa Android pode fazer
 * isso — é a ponte `MovieFlixApp.enviarTeclaPlayer` do shell MovieFlix TV
 * (MainActivity.PonteNativa), que:
 *   1º foca o iframe do player;
 *   2º despacha a tecla de verdade (DOWN + UP) para o container do WebView;
 *   3º devolve o foco ao site.
 *
 * A tecla entregue é ESPAÇO (Android KEYCODE_SPACE = 32), não a tecla de mídia
 * KEYCODE_MEDIA_PLAY_PAUSE (85): o WebView/Chromium roteia a tecla de mídia para
 * a MediaSession (não ligada ao `<video>` do iframe) em vez de entregá-la como
 * `keydown` ao player. ESPAÇO é uma tecla comum, entregue como `keydown`
 * confiável ao iframe focado — o caminho que faz um player web alternar play/pause.
 *
 * Sem ponte (navegador), alternamos o `<video>` de MESMA ORIGEM, se existir. O
 * protocolo `postMessage` do provedor NÃO é usado para play/pause: ele não tem
 * esse comando (mandar um evento inventado só criava a ILUSÃO de correção).
 */

/** Superfície da ponte nativa do shell Android TV (MainActivity.PonteNativa). */
export interface PontePlayerTv {
  /**
   * Injeta uma TECLA REAL no WebView com o iframe do player focado.
   * Devolve `true` quando a ponte existe e assumiu a entrega.
   */
  enviarTeclaPlayer?: (keyCode: number, key: string) => boolean;
}

/** Android KEYCODE_SPACE — tecla que todo player web escuta para play/pause. */
const KEYCODE_SPACE = 32;

/** A ponte nativa do player, quando o site roda dentro do APK (senão `null`). */
export function pontePlayerTv(): PontePlayerTv | null {
  try {
    const ponte = (window as unknown as { MovieFlixApp?: PontePlayerTv }).MovieFlixApp;
    return ponte && typeof ponte.enviarTeclaPlayer === 'function' ? ponte : null;
  } catch {
    return null;
  }
}

/** A camada nativa que entrega teclas REAIS ao player está disponível? (só no APK) */
export function temPonteDeTeclasNativa(): boolean {
  return pontePlayerTv() !== null;
}

/**
 * ALTERNA a reprodução pelo botão OK/ENTER do controle remoto.
 *
 * Ordem:
 *   1. se o `<video>` é LEGÍVEL (mesma origem), alterna DIRETO pelo estado real
 *      (`video.paused`) e trata a Promise de `play()`;
 *   2. senão (embed do provedor, cross-origin), entrega a TECLA REAL pela ponte
 *      nativa — o único caminho que muda o estado do vídeo no aparelho.
 *
 * @returns o estado que a interface deve mostrar: `true` = pausado. Quando o
 *          estado real não é legível (embed cross-origin), devolve `null` e quem
 *          chama mantém o toggle otimista do HUD.
 */
export function alternarPlayPausePlayer(
  iframe: HTMLIFrameElement | null | undefined,
  ponte: PontePlayerTv | null = pontePlayerTv(),
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

  // (2) Embed do provedor: entrega a TECLA REAL (ESPAÇO) pela ponte nativa.
  try {
    if (ponte?.enviarTeclaPlayer?.(KEYCODE_SPACE, 'Space')) return null;
  } catch {
    /* aparelho sem a ponte: nada a fazer */
  }
  return null;
}
