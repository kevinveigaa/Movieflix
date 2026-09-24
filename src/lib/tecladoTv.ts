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

/**
 * O app nativo (APK MovieFlix TV) está presente e expõe a ponte do teclado?
 *
 * Usado para decidir a ESTRATÉGIA de digitação do login:
 *  - com a ponte: pedimos o teclado da própria TV (Android TV / Google TV) e
 *    ele cobre a digitação do sistema;
 *  - sem a ponte (navegador de TV Box, WebView sem a ponte): abrimos o TECLADO
 *    NA TELA, que funciona em qualquer aparelho.
 * Sem essa distinção o usuário ficava sem NENHUMA forma de digitar.
 */
export function temPonteDeTeclado(): boolean {
  try {
    const w = window as unknown as {
      MovieFlixApp?: { mostrarTeclado?: () => void };
      MovieFlixAndroid?: { mostrarTeclado?: () => void };
    };
    const ponte = w.MovieFlixApp ?? w.MovieFlixAndroid;
    return typeof ponte?.mostrarTeclado === 'function';
  } catch {
    return false;
  }
}

/**
 * Informa ao shell nativo (APK MovieFlix TV) a VERSÃO DO SITE que acabou de
 * carregar.
 *
 * POR QUE ISSO EXISTE (causa raiz do "a correção não chega na TV"):
 * o app é um WebView do site. O WebView guarda o `index.html` em cache, então
 * uma TV que já abriu o app podia continuar rodando o bundle ANTIGO por dias —
 * mesmo com a correção publicada. Era essa a diferença entre "funciona no
 * navegador" e "não funciona no aparelho": no navegador o bundle era novo, na
 * TV era o de cache.
 *
 * A comparação NÃO pode ser feita aqui: só o lado nativo consegue recarregar
 * descartando o cache. Então o site só ANUNCIA a sua versão, e o nativo decide
 * se precisa recarregar (ver `PonteNativa.verificarVersao` no MainActivity).
 *
 * Fora do app (navegador de TV Box, site) a chamada é um no-op.
 */
export function informarVersaoAoApp(versao: string): void {
  try {
    const w = window as unknown as {
      MovieFlixApp?: { verificarVersao?: (v: string) => void };
      MovieFlixAndroid?: { verificarVersao?: (v: string) => void };
    };
    const ponte = w.MovieFlixApp ?? w.MovieFlixAndroid;
    ponte?.verificarVersao?.(versao);
  } catch {
    /* fora do app nativo: nada a fazer */
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
 * ══════════════════════════════════════════════════════════════════════════════
 * CAUSA RAIZ DO BUG "coloco o e-mail e ele sai / não dá tempo de digitar":
 *
 * Esta função fazia `blur()` + `focus()` para forçar o WebView a reenviar o
 * pedido de teclado. O `blur()` tira o foco do campo e o `focus()` o devolve —
 * só que entre os dois dispara `focusout`, e com ele o `onFocusOut` do
 * `useTvNavigation` LIMPA o destaque e RE-VALIDA o "primeiro OK" (apaga o
 * `data-mf-teclado-ok`). O efeito visível, exatamente o relatado pelo usuário:
 *
 *   usuário chega no campo → aperta OK → o campo "pisca" e o foco cai fora
 *   (no próximo elemento) → quando ele aperta OK de novo, o ciclo recomeça.
 *   Resultado: "eu coloco o e-mail, ele sai na hora, não dá nem tempo de digitar".
 *
 * A CORREÇÃO: NUNCA tirar o foco. Reafirmar o foco no mesmo elemento (que é
 * no-op quando ele já está focado — mas mantém o campo como owner do documento)
 * e reposicionar o cursor no fim, para o usuário continuar digitando de onde
 * parou. O "flash" de foco não é mais necessário porque o pedido explícito do
 * IME vai pela ponte nativa (`abrirTecladoDaTv`) e, quando não há IME, o
 * TECLADO DA TELA (TvKeyboard) cobre a digitação.
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function reabrirFocoDeTexto(
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  try {
    // Sem blur(): o foco NUNCA sai do campo (era o que fazia o usuário perder
    // o campo ao apertar OK). Se por algum motivo o campo já não é o ativo,
    // devolvemos o foco a ele — também sem passar por um blur explícito.
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    const fim = el.value?.length ?? 0;
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(fim, fim);
  } catch {
    try {
      el.focus();
    } catch {
      /* ignora */
    }
  }
}
