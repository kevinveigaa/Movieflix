import { useLayoutEffect, useRef, type MutableRefObject } from 'react';

/**
 * MovieFlix TV — FOCO INICIAL DETERMINÍSTICO de uma tela.
 * ════════════════════════════════════════════════════════════════════════════
 * Requisito do dono (tela de detalhes):
 *   "posicionar o foco automaticamente no botão de assistir, de modo que o
 *    usuário só precise apertar OK para começar a reprodução."
 *
 * Por que NÃO usar o `setTimeout` de recuperação que existia no `TvLayout`
 * (250/700/1300/2100/3200 ms): aquele timer é uma REDE, não uma garantia — ele
 * dispara muito depois de o usuário já ter assumido o controle e, nesse
 * momento, ROUBAR o foco (foi um dos motivos do foco "sair sozinho" no login).
 *
 * Aqui a regra é o oposto:
 *  • o foco vai para o elemento marcado com `[data-tv-initial-focus]` no MESMO
 *    commit que monta a tela (`useLayoutEffect` roda antes do paint — a tela já
 *    aparece com o foco no lugar certo, sem "pulo" de foco);
 *  • as poucas reafirmações são LIMITADAS (≈ 1,2 s) e só acontecem ENQUANTO o
 *    foco estiver realmente perdido (body / nada focado). No instante em que o
 *    usuário foca qualquer elemento, o hook para de agir — ele nunca disputa o
 *    foco, porque não é um mecanismo de recuperação perpétua: é a colocação do
 *    foco inicial, que precisa de uma janela curta porque o conteúdo da tela
 *    (e o fim do splash da TV) chega de forma assíncrona.
 *
 * Sobre a janela: a versão anterior da moldura da TV tentava isso com CINCO
 * timers espalhados (250/700/1300/2100/3200 ms) que agiam GLOBALMENTE, em
 * qualquer tela — inclusive enquanto o usuário digitava. Aqui a reafirmação é
 * local à tela, limitada no tempo e desiste ao primeiro sinal de que o usuário
 * assumiu o controle. É a diferença entre "tomar o foco de volta" e "colocar o
 * foco onde ele deve começar".
 */
export function useTvScreenFocus<T extends HTMLElement>(
  ativado = true,
): MutableRefObject<T | null> {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    if (!ativado) return;
    let encerrado = false;

    const inicio = Date.now();
    /** Janela em que o ALVO vence qualquer foco que não seja ele próprio. */
    const JANELA_DO_ALVO_MS = 400;

    /**
     * O usuário já assumiu o foco?
     *
     * Antes bastava existir QUALQUER elemento focado para o hook desistir — e
     * era aí que o foco inicial se perdia: na TV o conteúdo monta de forma
     * assíncrona e, nesse meio-tempo, outro elemento (a moldura da tela, ou o
     * primeiro controle que a navegação espacial foca) recebia o foco; o hook
     * via aquilo como "o usuário assumiu", desistia e o foco ficava longe do
     * botão de assistir. Agora:
     *  • nos primeiros instantes o ALVO vence (só ele conta como resolvido);
     *  • depois disso, um CONTROLE navegável de verdade (botão, card, link,
     *    input, `[data-tv-focusable]`, `[tabindex]` ≠ -1) conta como o usuário;
     *  • foco no body/documento/moldura continua não contando — o hook segue
     *    tentando colocar o foco no alvo, que é o objetivo da tela.
     */
    const usuarioNoControle = () => {
      const ativo = document.activeElement as HTMLElement | null;
      if (!ativo || ativo === document.body || ativo === document.documentElement) return false;
      if (ativo === ref.current) return true;
      if (Date.now() - inicio < JANELA_DO_ALVO_MS) return false;
      try {
        return ativo.matches(INTERATIVO);
      } catch {
        return false;
      }
    };

    /** Tenta focar o alvo. Devolve true quando não há mais nada a fazer. */
    const focar = (): boolean => {
      if (encerrado) return true;
      if (usuarioNoControle()) return true; // o usuário já navegou: não interfere
      const el = ref.current;
      if (!estaNoDocumento(el)) return false;
      try {
        el.focus({ preventScroll: true });
      } catch {
        return false;
      }
      const chegou = document.activeElement === el;
      if (chegou) marcarFocoVisual(el);
      return chegou;
    };

    // 1) Imediato — no mesmo tick da montagem.
    focar();

    // 2) Reafirmação limitada (~1,2 s), apenas enquanto o foco seguir perdido.
    //    Para na primeira vez em que o alvo é focado de verdade e, de todo modo,
    //    desiste ao 25º passo — nunca vira um loop de recuperação.
    let tentativas = 0;
    const id = window.setInterval(() => {
      tentativas += 1;
      if (focar() || tentativas >= 25) window.clearInterval(id);
    }, 50);

    return () => {
      encerrado = true;
      window.clearInterval(id);
    };
  }, [ativado]);

  return ref;
}

/** O elemento está realmente no documento E visível (largura > 0)? */
function estaNoDocumento(el: HTMLElement | null | undefined): el is HTMLElement {
  return !!el && el.isConnected === true && el.getBoundingClientRect().width > 0;
}

/**
 * PINTA O ANEL DE FOCO no elemento que acabou de receber o foco automático.
 *
 * POR QUE ISSO É NECESSÁRIO (requisito do dono: "quando o foco for colocado
 * automaticamente em 'Assistir', o usuário precisa perceber claramente que o
 * botão está selecionado… não depender de o usuário apertar uma tecla para o
 * foco aparecer"):
 *
 * a navegação espacial (`useTvNavigation`) só adiciona a classe `.tv-focus` —
 * que é o anel visível — quando o usuário APERTA uma seta (`focar()`). O foco
 * colocado por programa ficava, portanto, invisível até a primeira tecla: o
 * botão "Assistir" estava focado, mas nada na tela dizia isso.
 *
 * Aqui o MESMO anel é aplicado junto com o foco, no mesmo frame — sem alterar
 * o desenho do botão (a classe é exatamente a que o D-pad usa).
 */
function marcarFocoVisual(el: HTMLElement): void {
  try {
    document.querySelectorAll<HTMLElement>('.tv-focus').forEach((outro) => {
      if (outro !== el) outro.classList.remove('tv-focus');
    });
    el.classList.add('tv-focus');
  } catch {
    /* ambiente sem DOM: o foco nativo continua valendo */
  }
}

/**
 * Controles NAVEGÁVEIS de verdade: aquilo que o usuário alcança e confirma com
 * OK. Focar um destes significa que ele assumiu a navegação — o foco inicial
 * não deve mais disputar. A moldura de uma tela (`tabIndex={-1}`) fica de fora,
 * por isso o `:not([tabindex="-1"])`.
 */
const INTERATIVO =
  'button, [href], input, select, textarea, [data-tv-focusable], [tabindex]:not([tabindex="-1"])';
