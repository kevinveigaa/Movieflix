/**
 * MovieFlix TV — PONTE DE CONTROLE DO PLAYER (controle remoto → player do provedor)
 * ══════════════════════════════════════════════════════════════════════════════
 * PROBLEMA RELATADO: no player, o MovieFlix TV mostra o indicador na tela, mas o
 * player do provedor (embed em iframe) NÃO executa a ação — não pausa, não
 * avança e não retrocede pelo controle remoto.
 *
 * ── CAUSA RAIZ (medida, não suposta) ─────────────────────────────────────────
 * O player vive num IFRAME DE OUTRA ORIGEM. Existem dois fatos verificados:
 *
 *  1. Uma tecla CHEGA ao documento do iframe quando — e SOMENTE quando — o
 *     próprio elemento `<iframe>` é o `document.activeElement`. Nesse estado o
 *     navegador roteia a tecla para o documento do player (mesmo cross-origin) e
 *     o controle dele reage de verdade.
 *  2. Nesse mesmo estado o documento PAI não recebe mais a tecla (a entrega é
 *     exclusiva). E eventos sintéticos (`dispatchEvent`) NUNCA atravessam a
 *     fronteira de origem — por isso "mandar a tecla pelo JavaScript" não
 *     funcionava e o usuário só via o aviso na tela.
 *
 * Consequência: para o controle do provedor reagir é preciso uma TECLA REAL
 * entregue enquanto o iframe está focado. Só a camada nativa Android pode fazer
 * isso (um evento de tecla de verdade). Daí a ponte:
 *
 *   CONTROLE REMOTO → EVENTO DO CONTROLE → INTEGRAÇÃO DO MOVIEFLIX TV (aqui)
 *     → PONTE NATIVA (`MovieFlixApp.enviarTeclaPlayer`) → TECLA REAL NO IFRAME
 *     → PLAYER DO PROVEDOR EXECUTA A AÇÃO
 *
 * A ponte nativa (`MainActivity.PonteNativa.enviarTeclaPlayer`) injeta a tecla
 * no WebView, devolve o foco ao site depois e não intercepta nada por conta
 * própria. O player do provedor continua sendo o ÚNICO player — nada é
 * substituído, removido ou trocado; a fonte dos vídeos é a mesma.
 *
 * ── CAMINHOS POR AMBIENTE ────────────────────────────────────────────────────
 *  • Android TV / TV Box (APK): ponte nativa — o único caminho que faz o player
 *    reagir de verdade. É o caminho que o MovieFlix TV usa.
 *  • Navegador / WebView sem ponte: protocolo `postMessage` do embed e o vídeo
 *    nativo (`[data-mf-player]`), como antes (ver `@/lib/playerCommands`).
 * Ambos são tentados sempre: o provedor usa o que reconhecer e ignora o resto.
 */

import { enviarComandoPlayer, type AcaoPlayer } from '@/lib/playerCommands';

/** Ações de reprodução que o controle remoto dispara. */
export type AcaoControle = AcaoPlayer; // 'play' | 'pause' | 'toggle' | 'seekFwd' | 'seekBack'

/**
 * keyCode Android (KeyEvent) de cada ação — o MESMO valor que o controle remoto
 * envia ao Android. É o que a ponte nativa injeta para o player reagir.
 */
export const KEYCODE_ANDROID: Record<AcaoControle, number> = {
  play: 126, // KEYCODE_MEDIA_PLAY
  pause: 127, // KEYCODE_MEDIA_PAUSE
  toggle: 85, // KEYCODE_MEDIA_PLAY_PAUSE
  seekFwd: 90, // KEYCODE_MEDIA_FAST_FORWARD
  seekBack: 89, // KEYCODE_MEDIA_REWIND
};

/** Nome da tecla (só para depuração/log no lado nativo). */
export const NOME_TECLA: Record<AcaoControle, string> = {
  play: 'MediaPlay',
  pause: 'MediaPause',
  toggle: 'MediaPlayPause',
  seekFwd: 'MediaFastForward',
  seekBack: 'MediaRewind',
};

/** Superfície da ponte nativa do shell Android TV (MainActivity.PonteNativa). */
export interface PontePlayerTv {
  /**
   * Injeta uma TECLA REAL no WebView com o iframe do player focado.
   * Devolve `true` quando a ponte existe e assumiu a entrega.
   */
  enviarTeclaPlayer?: (keyCode: number, key: string) => boolean;
}

/** A ponte nativa do player, quando o site roda dentro do APK (senão `null`). */
export function pontePlayerTv(): PontePlayerTv | null {
  try {
    const ponte = (window as unknown as { MovieFlixApp?: PontePlayerTv }).MovieFlixApp;
    return ponte && typeof ponte.enviarTeclaPlayer === 'function' ? ponte : null;
  } catch {
    return null;
  }
}

/**
 * A camada nativa que entrega teclas REAIS ao player está disponível?
 *
 * Só o APK a expõe. Quando ela existe, o controle do provedor reage de verdade;
 * quando não existe (navegador), valem o `postMessage` e o vídeo nativo.
 */
export function temPonteDeTeclasNativa(): boolean {
  return pontePlayerTv() !== null;
}

/**
 * Aciona o controle do player do provedor para uma ação do controle remoto.
 *
 * Tenta, nesta ordem: (1) a PONTE NATIVA que entrega a tecla real ao player
 * (Android TV); (2) o protocolo de `postMessage` do embed; (3) o vídeo nativo
 * `[data-mf-player]`. Devolve `true` quando ao menos um caminho agiu.
 *
 * @param iframe   o `<iframe>` do embed do provedor
 * @param acao     a ação pedida pelo controle
 * @param passoSeek segundos do avanço/retrocesso
 * @param ponte    ponte nativa (injetável nos testes)
 */
export function acionarControlePlayer(
  iframe: HTMLIFrameElement | null | undefined,
  acao: AcaoControle,
  passoSeek: number,
  ponte: PontePlayerTv | null = pontePlayerTv(),
): boolean {
  let agiu = false;

  // (1) PONTE NATIVA — entrega uma TECLA REAL com o iframe focado.
  try {
    if (ponte?.enviarTeclaPlayer?.(KEYCODE_ANDROID[acao], NOME_TECLA[acao])) agiu = true;
  } catch {
    /* aparelho sem a ponte: seguimos para os caminhos de navegador */
  }

  // (2) + (3) Caminhos de navegador/WebView sem ponte (postMessage + vídeo nativo).
  if (enviarComandoPlayer(iframe, acao, passoSeek)) agiu = true;

  return agiu;
}
