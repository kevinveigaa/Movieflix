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

    /** O usuário já assumiu o foco? (há um elemento válido focado, não o body) */
    const usuarioNoControle = () => {
      const ativo = document.activeElement as HTMLElement | null;
      return !!ativo && ativo !== document.body && ativo !== document.documentElement;
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
      return document.activeElement === el;
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
