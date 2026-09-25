/**
 * MovieFlix TV — GUARDA DE FOCO do formulário de TV (login / busca).
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE MÓDULO EXISTE (e por que as tentativas anteriores falharam)
 *
 * A especificação do dono é literal: "o foco deve permanecer no campo durante
 * toda a digitação (do início ao fim do login), SEM timers, interceptações ou
 * re-renderizações que roubem o foco".
 *
 * As três rodadas anteriores tentaram resolver isso de formas que NÃO cumprem a
 * regra:
 *
 *  1. recuperação por TIMER (`setTimeout` em 250/700/1300/2100/3200 ms). Um
 *     timer é, por definição, uma janela em que o foco pode ficar solto — e é
 *     exatamente durante ela que o usuário está digitando. Além disso, o timer
 *     dispara DEPOIS do fato: o foco já saiu, o campo já desbotou na tela;
 *  2. recuperação amarrada a `document.activeElement` + `blur()`. O `blur()`
 *     reemite `focusout`, o handler global reage, limpa o destaque e rearma a
 *     regra de "primeiro OK" — o campo pisca e o foco cai fora;
 *  3. uma condição (`focoDoUsuario`) que só reconhecia INPUT/TEXTAREA — com o
 *     foco numa TECLA do teclado na tela a recuperação continuava agindo.
 *
 * A INVARIANTE DESTE MÓDULO (uma só, sem timer, sem blur, sem escrita em DOM):
 *
 *     Enquanto o formulário estiver montado, `document.activeElement` NUNCA
 *     fica fora dele.
 *
 * Como isso é garantido, usando SOMENTE eventos de foco:
 *
 *  • `focusin` (fase de captura, no documento): dispara no INSTANTE em que um
 *    elemento recebe o foco. Se o alvo está fora do formulário, o foco é
 *    devolvido ao campo ativo SINCRONAMENTE — dentro do próprio evento. Não
 *    existe janela entre a fuga e a recuperação: elas são o mesmo evento.
 *
 *  • `focusout` (fase de captura): cobre o único caso que `focusin` não vê —
 *    o foco indo para "lugar nenhum" (`body`/`documentElement`), que não emite
 *    `focusin`. Confere no MICROTASK seguinte (mesmo task de JS, custo zero,
 *    não é timer) se o foco realmente saiu e, se saiu, devolve.
 *
 *  • `focusin` de volta na RAIZ: se o foco entrar no formulário vindo de fora
 *    (o usuário voltou pelo Voltar do controle, por exemplo), o campo ativo é
 *    reafirmado — o foco nunca "reaparece" no body.
 *
 * O que a guarda NUNCA faz:
 *  • não chama `blur()` (não reemite `focusout`, não limpa o destaque);
 *  • não usa `setTimeout`/`setInterval`/`requestAnimationFrame`;
 *  • não escreve no DOM (não altera value/atributos — nada de re-render);
 *  • não interfere com a digitação: teclas de caractere não são tocadas.
 *
 * Ela também NÃO briga com a navegação deliberada dentro do formulário: mover
 * o foco de um ponto para outro DENTRO da raiz (campo → campo, campo → tecla do
 * teclado na tela, campo → botão) é permitido; só a SAÍDA é revertida.
 */

/** Opções da guarda. */
export interface OpcoesDaGuarda {
  /** Elemento que delimita o formulário — o foco não pode sair dele. */
  raiz: HTMLElement;
  /** Devolve o elemento que deve receber o foco de volta (o campo ativo). */
  alvoPreferido: () => HTMLElement | null;
  /** Registro de evidências (opcional; usado pelo teste headless). */
  aoRecuperar?: (alvo: HTMLElement | null) => void;
}

/** O elemento está realmente no documento (não foi desmontado pelo React)? */
function estaNoDocumento(el: HTMLElement | null | undefined): el is HTMLElement {
  return !!el && el.isConnected === true;
}

/**
 * Instala a guarda de foco do formulário de TV.
 *
 * @returns função de limpeza — removê-la é o que permite ao usuário SAIR da
 *          tela (navegar para a Home) sem o foco ser puxado de volta.
 */
export function instalarGuardaDeFoco({
  raiz,
  alvoPreferido,
  aoRecuperar,
}: OpcoesDaGuarda): () => void {
  /**
   * Guarda de reentrância: `focus()` reemite eventos de foco; sem esta trava a
   * própria recuperação entraria em recursão.
   */
  let restaurando = false;

  /**
   * O destino do foco é um ponto legítimo DENTRO do formulário?
   * `null`/`body`/`documentElement` NÃO são — é o foco ficando órfão.
   */
  const destinoInterno = (alvo: EventTarget | null): boolean => {
    const el = alvo as HTMLElement | null;
    if (!el) return false;
    if (el === document.body || el === document.documentElement) return false;
    return raiz.contains(el);
  };

  /**
   * Devolve o foco ao alvo preferido SE — e somente se — ele estiver fora do
   * formulário. `focus()` num elemento que já está ativo é no-op, então isto
   * pode ser chamado sem medo.
   */
  const restaurar = (): boolean => {
    if (restaurando) return false;
    // A tela foi desmontada (o usuário navegou): não puxa o foco de volta.
    if (!estaNoDocumento(raiz)) return false;

    const ativo = document.activeElement as HTMLElement | null;
    if (ativo && raiz.contains(ativo)) return false; // já está dentro: nada a fazer

    const alvo = alvoPreferido();
    if (!estaNoDocumento(alvo)) return false;

    restaurando = true;
    try {
      alvo.focus({ preventScroll: true });
    } catch {
      /* ambiente sem foco programável: o teclado na tela ainda funciona */
    } finally {
      restaurando = false;
    }
    aoRecuperar?.(alvo);
    return true;
  };

  /** Um elemento recebeu o foco: se foi fora do formulário, volta na hora. */
  const aoEntrar = (ev: FocusEvent) => {
    if (destinoInterno(ev.target)) return;
    restaurar();
  };

  /**
   * O foco está deixando um elemento do formulário.
   *
   * Se o destino já é outro ponto do formulário, nada a fazer. Caso contrário,
   * o foco pode estar indo para o `body` — caso em que `focusin` NUNCA dispara
   * (é o buraco que deixava o foco "sumir" quando o sistema fechava o teclado).
   * Confere no microtask seguinte, ainda dentro do MESMO task de JS.
   */
  const aoSair = (ev: FocusEvent) => {
    if (destinoInterno(ev.relatedTarget)) return;
    queueMicrotask(restaurar);
  };

  document.addEventListener('focusin', aoEntrar, true);
  document.addEventListener('focusout', aoSair, true);

  return () => {
    document.removeEventListener('focusin', aoEntrar, true);
    document.removeEventListener('focusout', aoSair, true);
  };
}

/**
 * O elemento está DENTRO de um formulário de TV (região `[data-tv-form]`)?
 *
 * É a definição ÚNICA de "o usuário está num formulário" — usada tanto pela
 * navegação espacial (que se abstém dentro dela) quanto pela guarda de foco.
 * As rodadas anteriores tinham DUAS definições parecidas (uma no layout, outra
 * na navegação); a divergência entre elas foi o que criou o bug de o foco
 * escapar do campo.
 */
export function dentroDeFormularioTv(el: Element | null | undefined): boolean {
  if (!el) return false;
  return el.closest?.('[data-tv-form]') != null;
}

/**
 * O foco está em algo que o USUÁRIO escolheu dentro de um formulário de TV?
 *
 * Repare que a checagem é por REGIÃO (`closest`), então as TECLAS do teclado na
 * tela também contam como "dentro do formulário" — era exatamente esse o caso
 * que a condição antiga (`INPUT`/`TEXTAREA` apenas) não reconhecia, fazendo a
 * recuperação de foco roubar o foco de quem estava apertando uma tecla.
 */
export function focoEmFormularioTv(): boolean {
  const ativo = document.activeElement as HTMLElement | null;
  if (!ativo || ativo === document.body) return false;
  return dentroDeFormularioTv(ativo);
}
