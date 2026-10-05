/**
 * MovieFlix TV — CLASSIFICAÇÃO DAS TECLAS DO CONTROLE (módulo puro).
 * ══════════════════════════════════════════════════════════════════════════════
 * FONTE ÚNICA DA VERDADE de "que tecla é esta?" para o player do MovieFlix TV.
 *
 * REQUISITO DO DONO (controle remoto físico, sem mouse/touchscreen):
 *   • OK/ENTER            → play/pause REAL do vídeo;
 *   • SETA DIREITA (→)    → avançar exatamente 30s no vídeo REAL;
 *   • SETA ESQUERDA (←)   → voltar exatamente 30s no vídeo REAL;
 *   • SETAS ↑ / ↓         → navegação de foco entre os controles do player;
 *   • PLAY/PAUSE físico   → play/pause REAL;
 *   • BACK                → tela anterior (tratado pelo shell/WebView).
 *
 * ── POR QUE UM MÓDULO SÓ ──────────────────────────────────────────────────────
 * Antes, a lógica de teclado do player vivia espalhada por vários donos (o
 * `TvPlayerPage`, o `useTvNavigation` global e o `useTvPlayerControls` legado),
 * cada um com a sua lista de keyCodes. As listas divergiam e a MESMA pulsação
 * podia ser tratada por dois donos. Agora existe UMA definição, usada por UM
 * único listener (ver `TvPlayerPage`).
 *
 * Aceita `key` E `keyCode` porque muitas TVs enviam `e.key === 'Unidentified'`
 * e só o keyCode é confiável (Android TV: 19/20/21/22 setas, 23 OK, 4 BACK).
 */

/** Ações que o player reconhece pelo controle remoto. */
export type AcaoTecla = 'ok' | 'left' | 'right' | 'up' | 'down' | 'back' | 'playpause';

/** Forma mínima de um evento de teclado (aceita KeyboardEvent e objetos de teste). */
export interface TeclaLike {
  key?: string;
  code?: string;
  keyCode?: number;
  which?: number;
}

/** keyCodes de OK/ENTER aceitos (13 ENTER, 23 DPAD_CENTER, 66 NUMPAD_ENTER). */
const OK_KEYCODES = [13, 23, 66];
/** Nomes de `key` que significam OK/ENTER em TVs. */
const OK_KEYS = ['Enter', 'OK', 'Select', 'Accept'];

/** keyCodes de BACK (4 Android, 8 Backspace, 27 Escape, 461 webOS, 10009 Tizen, 166 BrowserBack). */
const BACK_KEYCODES = [4, 8, 27, 166, 461, 10009];
const BACK_KEYS = ['GoBack', 'BrowserBack', 'XF86Back', 'Escape', 'Backspace'];

/** keyCodes de PLAY/PAUSE físico (85 media play/pause, 179 play/pause, 126 play, 127 pause). */
const PLAYPAUSE_KEYCODES = [85, 179, 126, 127];
const PLAYPAUSE_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'Play', 'Pause'];

/**
 * Classifica uma tecla do controle remoto.
 *
 * @returns a ação correspondente, ou `null` para teclas que o player ignora
 *          (volume, números, etc. — o volume é do aparelho, camada nativa).
 */
export function classificarTecla(e: TeclaLike): AcaoTecla | null {
  const k = e.key ?? '';
  const code = e.code ?? '';
  const c = e.keyCode || e.which || 0;

  // OK / ENTER
  if (OK_KEYS.includes(k) || code === 'Enter' || OK_KEYCODES.includes(c)) return 'ok';

  // PLAY/PAUSE físico (teclas de mídia do controle)
  if (PLAYPAUSE_KEYS.includes(k) || PLAYPAUSE_KEYCODES.includes(c)) return 'playpause';

  // BACK
  if (BACK_KEYS.includes(k) || BACK_KEYCODES.includes(c)) return 'back';

  // SETAS (Android TV 19-22; navegador 37-40)
  if (k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21) return 'left';
  if (k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22) return 'right';
  if (k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19) return 'up';
  if (k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20) return 'down';

  return null;
}
