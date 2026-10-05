/**
 * MovieFlix TV — CLASSIFICAÇÃO DAS TECLAS DO CONTROLE (módulo puro).
 * ═══════════════════════════════════════════════════════════════════════════
 * FONTE ÚNICA DA VERDADE de "que tecla é esta?" para o player do MovieFlix TV.
 *
 * ── O QUE MUDOU (requisito do dono) ───────────────────────────────────────
 * O player da TV tem UMA ÚNICA ação pelo controle remoto: OK/ENTER = play/pause.
 * Por isso este módulo reconhece SOMENTE OK/ENTER. Em particular:
 *   • as SETAS (← / → / ↑ / ↓) NÃO fazem nada no player — não há mais seek ±10s
 *     nem navegação por setas no player;
 *   • as teclas de VOLUME/MUTE NÃO são tratadas aqui — o volume é do aparelho
 *     (camada nativa) e o player não deve reagir a elas;
 *   • o BACK também não é tratado aqui (o shell/WebView trata a navegação).
 *
 * ── POR QUE UM MÓDULO SÓ ──────────────────────────────────────────────────
 * Antes, a lógica de teclado do player vivia espalhada por vários donos (o
 * `TvPlayerPage`, o `useTvNavigation` global e o `useTvPlayerControls` legado),
 * cada um com a sua lista de keyCodes. As listas divergiam e a MESMA pulsação
 * podia ser tratada por dois donos (pausar e retomar no mesmo toque) — o sintoma
 * relatado: "o OK não pausa/despausa". Agora existe UMA definição de "OK",
 * usada por UM único listener (ver `TvPlayerPage`).
 */

/** A ÚNICA ação que o player reconhece pelo controle: OK/ENTER = play/pause. */
export type AcaoTecla = 'ok';

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

/**
 * Classifica uma tecla do controle remoto.
 *
 * @returns `'ok'` quando a tecla é OK/ENTER; `null` para QUALQUER outra tecla
 *          (setas, volume, back, etc.) — o player só reage ao OK/ENTER.
 */
export function classificarTecla(e: TeclaLike): AcaoTecla | null {
  const k = e.key ?? '';
  const code = e.code ?? '';
  const c = e.keyCode || e.which || 0;

  if (OK_KEYS.includes(k) || code === 'Enter' || OK_KEYCODES.includes(c)) return 'ok';

  return null;
}
