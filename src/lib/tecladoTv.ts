/**
 * MovieFlix TV — teclado da PRÓPRIA TV (Android TV / Google TV).
 *
 * CAUSA RAIZ do bug relatado "antes dava para digitar no login, agora não":
 * o campo de texto recebia foco por `.focus()` PROGRAMÁTICO (a navegação
 * espacial do D-pad foca o campo para o usuário ver o anel de seleção e saber
 * onde está). Só que, no WebView do Android, um foco programático NÃO é um
 * gesto do usuário — e é justamente o gesto que faz o sistema abrir o teclado
 * virtual. Resultado: o campo ficava com o anel de foco, mas o teclado nunca
 * subia, e a digitação era impossível.
 *
 * A correção tem DUAS camadas, porque uma sozinha não cobre todos os firmwares:
 *  1. `reabrirFocoDeTexto` — reafirma o foco DENTRO do evento de tecla (que É
 *     um gesto do usuário). Um `.focus()` repetido no mesmo elemento é no-op,
 *     por isso o foco "pisca" (blur + focus) para o WebView reenviar o pedido
 *     de teclado.
 *  2. `abrirTecladoDaTv` — pede o teclado EXPLICITAMENTE à camada nativa
 *     (`MovieFlixApp.mostrarTeclado()`), que chama `InputMethodManager`
 *     diretamente. É o caminho mais confiável em TV Box com teclado de sistema.
 */

/** Pede o teclado da TV à camada nativa (quando dentro do app). */
export function abrirTecladoDaTv(): void {
  try {
    const w = window as unknown as {
      MovieFlixApp?: { mostrarTeclado?: () => void };
      MovieFlixAndroid?: { mostrarTeclado?: () => void };
    };
    const ponte = w.MovieFlixApp ?? w.MovieFlixAndroid;
    ponte?.mostrarTeclado?.();
  } catch {
    /* fora do app nativo: o teclado do sistema abre sozinho */
  }
}

/** O elemento é um campo de texto editável? */
export function ehCampoDeTexto(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return (el as HTMLElement).isContentEditable === true;
  const tipo = ((el as HTMLInputElement).type || 'text').toLowerCase();
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ].includes(tipo);
}

/**
 * Reafirma o foco de um campo de texto dentro de um gesto do usuário.
 *
 * O "piscar" de foco (blur + focus) é o que faz o WebView do Android reenviar
 * o pedido de teclado quando o campo JÁ estava focado — repetir `.focus()` no
 * mesmo elemento é no-op e não abre nada. O cursor é preservado no fim do
 * texto para o usuário continuar digitando de onde parou.
 */
export function reabrirFocoDeTexto(
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  try {
    const fim = el.value?.length ?? 0;
    el.blur();
    el.focus({ preventScroll: true });
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(fim, fim);
  } catch {
    try {
      el.focus();
    } catch {
      /* ignora */
    }
  }
}
