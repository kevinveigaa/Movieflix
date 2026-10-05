/**
 * MovieFlix TV — CLASSIFICAÇÃO DAS TECLAS DO CONTROLE REMOTO (módulo puro).
 * ══════════════════════════════════════════════════════════════════════════════
 * FONTE ÚNICA DA VERDADE de "que tecla é esta?".
 *
 * POR QUE ESTE MÓDULO EXISTE (causa raiz do bug do OK):
 * a lógica de teclado do player estava espalhada por três lugares — o
 * `TvPlayerPage` (keydown/keyup), o `useTvNavigation` global (captura) e o
 * `useTvPlayerControls` (legado) — cada um com a sua própria lista de keyCodes.
 * As listas divergiam: o OK era reconhecido como 13/23 num lugar, como 32 noutro,
 * e a MESMA pulsação podia ser tratada por dois donos (pausar e retomar no mesmo
 * toque). Aqui existe UMA definição, usada por UM único caminho de listeners.
 *
 * ── REGRAS (o que conta como cada ação) ──────────────────────────────────────
 *  • OK/ENTER  → `key` "Enter"/"OK"/"Select"/"Accept", `code` "Enter",
 *                keyCode 13 (ENTER), 23 (DPAD_CENTER), 66 (NUMPAD_ENTER).
 *                NÃO inclui 32 (ESPAÇO): a ponte nativa injeta ESPAÇO no iframe
 *                do player para o play/pause; se o iframe não estiver focado,
 *                essa tecla chega ao documento pai e reentraria aqui — o que
 *                alternaria duas vezes. O OK físico da TV chega como 13/23.
 *  • AVANÇAR   → seta direita (39/22) ou "ArrowRight"/"Right".
 *  • RETROCEDER→ seta esquerda (37/21) ou "ArrowLeft"/"Left".
 *  • VOLTAR    → "GoBack"/"BrowserBack"/"XF86Back"/"Escape"/"Backspace" ou
 *                keyCode 4 (BACK), 8, 27, 461 (webOS), 10009 (Tizen), 166.
 *  • VOLUME    → 24/25 (volume), 164 (mudo) ou os nomes de áudio.
 *  • PLAY/PAUSE→ tecla de MÍDIA (85/179) — chega pelo evento `mf-media-key` do
 *                shell Android, não pelo keydown (o WebView a consome).
 *
 * As teclas de MÍDIA (85/179/90/89/228/227) NÃO são classificadas aqui como
 * seek/ok: elas são entregues pelo shell nativo como `mf-media-key` e têm um
 * caminho próprio. Tratá-las também no keydown faria a mesma pulsação disparar
 * duas ações quando a injeção nativa cai no documento pai.
 */

/** Ação que uma tecla do controle representa dentro do player. */
export type AcaoTecla =
  | 'ok'
  | 'seekFwd'
  | 'seekBack'
  | 'cima'
  | 'baixo'
  | 'back'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'playPause';

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

/** keyCodes de VOLTAR (Android 4, webOS 461, Tizen 10009, Escape 27, Backspace 8). */
const BACK_KEYCODES = [4, 8, 27, 166, 461, 10009];
const BACK_KEYS = ['GoBack', 'BrowserBack', 'XF86Back', 'Escape', 'Backspace'];

/**
 * Classifica uma tecla do controle remoto.
 *
 * @returns a ação, ou `null` quando a tecla não pertence ao player.
 */
export function classificarTecla(e: TeclaLike): AcaoTecla | null {
  const k = e.key ?? '';
  const code = e.code ?? '';
  const c = e.keyCode || e.which || 0;

  // ── VOLUME (sempre nosso: nenhum outro componente da TV usa volume) ────────
  if (c === 24 || k === 'AudioVolumeUp') return 'volumeUp';
  if (c === 25 || k === 'AudioVolumeDown') return 'volumeDown';
  if (c === 164 || k === 'AudioVolumeMute') return 'mute';

  // ── VOLTAR ─────────────────────────────────────────────────────────────────
  if (BACK_KEYS.includes(k) || BACK_KEYCODES.includes(c)) return 'back';

  // ── OK / ENTER (uma única definição, sem ESPAÇO) ───────────────────────────
  if (OK_KEYS.includes(k) || code === 'Enter' || OK_KEYCODES.includes(c)) return 'ok';

  // ── SETAS (avançar / retroceder) ───────────────────────────────────────────
  if (k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22) return 'seekFwd';
  if (k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21) return 'seekBack';
  if (k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19) return 'cima';
  if (k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20) return 'baixo';

  return null;
}

/**
 * Classifica o `detail` de um evento `mf-media-key` (emitido pelo shell Android).
 *
 * O shell traduz as teclas de MÍDIA do controle para estes nomes; é o caminho
 * ÚNICO das teclas de mídia (o keydown não as vê).
 */
export type AcaoMidia = 'togglePlay' | 'seekFwd' | 'seekBack' | 'stop' | 'next' | 'volUp' | 'volDown' | 'mute';

export function ehAcaoMidia(detail: unknown): detail is AcaoMidia {
  return (
    detail === 'togglePlay' ||
    detail === 'seekFwd' ||
    detail === 'seekBack' ||
    detail === 'stop' ||
    detail === 'next' ||
    detail === 'volUp' ||
    detail === 'volDown' ||
    detail === 'mute'
  );
}
