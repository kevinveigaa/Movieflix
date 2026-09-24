/**
 * MovieFlix TV — teclado da PRÓPRIA TV (Android TV / Google TV / TV Box).
 *
 * ── O QUE ESTE MÓDULO FAZ (e o que NÃO faz) ─────────────────────────────────
 *
 * Ele é apenas a PONTE para o teclado nativo do aparelho. Quem DIGITA é sempre
 * uma coisa só, nunca as duas:
 *
 *  • quando o aparelho TEM teclado de sistema (IME), `pedirTecladoNativo()`
 *    pede que ele suba — e a digitação vai pelo IME;
 *  • quando o aparelho NÃO tem IME (muitos TV Box), o `TvLoginPage` abre o
 *    TECLADO NA TELA (`TvKeyboard`), que não depende de IME nenhum.
 *
 * ── CAUSA RAIZ DO BUG "o teclado abre e fecha sozinho / troca de um para o
 *    outro" (eliminada nesta versão) ─────────────────────────────────────────
 *
 * Antes existiam DOIS pedidos de teclado para o mesmo OK, disparados por donos
 * diferentes:
 *
 *  1. `useTvNavigation` pedia o teclado do sistema ao ver o PRIMEIRO OK num
 *     campo de texto (`campo.dataset.mfTecladoOk`) e ainda chamava
 *     `reabrirFocoDeTexto` (que numa versão anterior fazia blur()+focus());
 *  2. o `TvLoginPage` abria o TECLADO NA TELA no mesmo OK.
 *
 * Resultado no aparelho real: o teclado do sistema subia, o teclado na tela
 * aparecia por cima e os dois se alternavam — exatamente o "liga e desliga"
 * relatado. Agora existe UM dono só: o `TvLoginPage`. A navegação global não
 * pede, não abre e não fecha teclado nenhum. Para isso a antiga função
 * `abrirTecladoDaTv()` foi REMOVIDA daqui — não existe mais caminho paralelo.
 */

/** Forma da ponte nativa exposta pelo APK MovieFlix TV (MainActivity). */
interface PonteTecladoNativo {
  mostrarTeclado?: () => void;
  esconderTeclado?: () => void;
  verificarVersao?: (versao: string) => void;
}

/** Obtém a ponte nativa, quando o site está rodando dentro do APK de TV. */
function ponte(): PonteTecladoNativo | null {
  try {
    const w = window as unknown as {
      MovieFlixApp?: PonteTecladoNativo;
      MovieFlixAndroid?: PonteTecladoNativo;
    };
    return w.MovieFlixApp ?? w.MovieFlixAndroid ?? null;
  } catch {
    return null;
  }
}

/**
 * O app nativo (APK MovieFlix TV) está presente E tem teclado de sistema?
 *
 * Usado para decidir a ESTRATÉGIA de digitação do login:
 *  - com a ponte: pedimos o teclado da própria TV (Android TV / Google TV) —
 *    em aparelhos com IME ele é o caminho confiável;
 *  - sem a ponte (navegador de TV Box, WebView sem a ponte): abrimos o TECLADO
 *    NA TELA, que funciona em qualquer aparelho.
 * Sem essa distinção o usuário ficava sem NENHUMA forma de digitar.
 */
export function temPonteDeTeclado(): boolean {
  return typeof ponte()?.mostrarTeclado === 'function';
}

/**
 * Pede o teclado NATIVO da TV (IME) para o campo que já está focado.
 *
 * O pedido parte SEMPRE de dentro do gesto do usuário (o OK do controle), que
 * é a condição para o Android abrir o IME. Nada aqui mexe no foco: quem chama
 * já garantiu que o campo é o `document.activeElement`.
 *
 * É no-op fora do app nativo (navegador) — nesse caso, ou o IME do sistema
 * resolve, ou o teclado na tela cobre a digitação.
 */
export function pedirTecladoNativo(): void {
  try {
    ponte()?.mostrarTeclado?.();
  } catch {
    /* aparelho sem IME: o teclado na tela é a digitação */
  }
}

/**
 * Pede ao shell nativo que ESCONDA o teclado de sistema.
 *
 * Usado quando o usuário fecha a digitação (Voltar) ou sai da tela de login —
 * sem isso o IME podia continuar aberto sobre a tela seguinte. É best-effort:
 * fora do app é no-op.
 */
export function esconderTecladoNativo(): void {
  try {
    ponte()?.esconderTeclado?.();
  } catch {
    /* ignora */
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
    ponte()?.verificarVersao?.(versao);
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
 * Reafirma o foco de um campo de texto SEM tirá-lo de lá.
 *
 * O `blur()+focus()` que esta função já fez um dia era o gatilho do foco
 * "escapando": entre os dois dispara `focusout`, e o handler global reagia,
 * limpando o destaque e re-validando o "primeiro OK" — o campo "piscava" e o
 * foco caía fora. Hoje ela só garante que o campo É o elemento ativo (no-op
 * quando já é) e devolve o cursor para o fim, para o usuário continuar
 * digitando de onde parou.
 */
export function reabrirFocoDeTexto(
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  try {
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
