import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * TvKeyboard — teclado VIRTUAL de TV, navegável apenas com o D-pad.
 *
 * POR QUE ELE EXISTE (causa raiz do bug "não consigo digitar no login da TV"):
 * nas TVs/TV Box o teclado virtual DO SISTEMA (IME) só sobe quando o WebView
 * recebe um gesto real do usuário — e o foco que a navegação espacial dá aos
 * campos é PROGRAMÁTICO. O campo ficava com o anel de foco, mas o teclado nunca
 * aparecia. Este teclado NÃO depende de IME: cada tecla é um <button> que a
 * navegação espacial (setas + OK) alcança como qualquer elemento focável de TV.
 *
 * ── O QUE FOI CORRIGIDO NESTA VERSÃO ─────────────────────────────────────────
 *  1. OCULTO POR PADRÃO: ao abrir a tela de login o teclado NÃO aparece sozinho
 *     (não ocupa a tela sem o usuário ter pedido). Quem controla a visibilidade
 *     é o TvLoginPage, pelo botão de teclado.
 *  2. COMPLETO: a versão anterior tinha um alfabeto "de bolso" que misturava
 *     letras, dígitos e três símbolos numa grade só, e ficava INCOMPLETO para
 *     e-mail/senha. Agora há TRÊS ABAS — Letras, Números e Símbolos — e os
 *     símbolos cobrem tudo que um e-mail e uma senha pedem
 *     (`@ . _ - + ! # $ % & * ( ) = / ? , ; : ' "` e mais). As abas são
 *     alcançáveis com ← →, como qualquer outro controle.
 *  3. foco inicial nas LETRAS (não em "Entrar"): quem abre o teclado quer
 *     digitar.
 *
 * MAIÚSCULAS/MINÚSCULAS: senhas diferenciam maiúsculas de minúsculas, então a
 * tecla ⇧ alterna. Como e-mails quase sempre são minúsculos, o teclado começa
 * em minúsculas; ⇧ vale para UMA letra (volta sozinho, como no celular).
 */

export interface TvKeyboardProps {
  /** Recebe o caractere a inserir no campo ativo. */
  onTecla: (tecla: string) => void;
  /**
   * Para onde o foco vai quando o usuário pede para SAIR do teclado:
   *  - `cima`    — na primeira linha, `↑` volta ao formulário;
   *  - `baixo`   — na última linha, `↓` vai à ação do formulário ("Entrar");
   *  - `escapar` — o Back/Voltar do controle fecha o teclado.
   * Sem estes retornos o foco cairia no fim do documento ("o foco sumiu"),
   * que é o efeito mais temido numa TV.
   */
  onSair?: (sentido: 'cima' | 'baixo' | 'escapar') => void;
  /** Apaga o último caractere do campo ativo. */
  onApagar: () => void;
  /** Limpa o campo ativo. */
  onLimpar: () => void;
  /** Ação principal do formulário (Entrar). */
  onEntrar: () => void;
  /** Fecha o teclado (volta para os campos). */
  onFechar?: () => void;
}

type Aba = 'letras' | 'numeros' | 'simbolos';

/** Linhas de cada aba — todas as teclas são focáveis pelo D-pad. */
const LINHAS: Record<Aba, string[][]> = {
  letras: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', "'", '-'],
  ],
  numeros: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['@', '.', '_', '-', '+', '/', ':', '(', ')', '#'],
    ['!', '?', '=', ',', ';', '%', '&', '*', '$', '"'],
  ],
  simbolos: [
    ['@', '.', '_', '-', '+', '!', '#', '$', '%', '&'],
    ['*', '(', ')', '=', '/', '?', ',', ';', ':', "'"],
    ['"', '~', '^', '`', '[', ']', '{', '}', '<', '>'],
    ['|', '\\', '§', '°', '±', '€', '£', '¢'],
  ],
};

const ROTULO_ABA: Record<Aba, string> = {
  letras: 'ABC',
  numeros: '123',
  simbolos: '#+&',
};

function ehLetra(t: string): boolean {
  return /^[A-Za-zÇç]$/.test(t);
}

export function TvKeyboard({
  onTecla,
  onApagar,
  onLimpar,
  onEntrar,
  onFechar,
  onSair,
}: TvKeyboardProps) {
  // Começa em minúsculas (e-mail costuma ser minúsculo). ⇧ = uma letra.
  const [maiuscula, setMaiuscula] = useState(false);
  const [aba, setAba] = useState<Aba>('letras');
  const gradeRef = useRef<HTMLDivElement>(null);
  const raizRef = useRef<HTMLDivElement>(null);
  const abasRef = useRef<HTMLDivElement>(null);
  const funcoesRef = useRef<HTMLDivElement>(null);
  const jaPosicionou = useRef(false);

  function enviar(t: string) {
    if (ehLetra(t)) {
      onTecla(maiuscula ? t.toUpperCase() : t.toLowerCase());
      if (maiuscula) setMaiuscula(false);
      return;
    }
    onTecla(t);
  }

  // Foco inicial na PRIMEIRA LETRA (quem abriu o teclado quer digitar). Só na
  // montagem: depois disso o foco pertence ao usuário.
  useEffect(() => {
    if (jaPosicionou.current) return;
    jaPosicionou.current = true;
    const t = window.setTimeout(() => {
      gradeRef.current
        ?.querySelector<HTMLButtonElement>('[data-tv-key="Q"]')
        ?.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(t);
  }, []);

  /**
   * Ao trocar de aba, o botão focado pode deixar de existir (a primeira tecla de
   * cada aba é diferente) — o foco cairia no corpo do documento e o D-pad
   * "sumiria". Reposiciona na primeira tecla da nova aba, dentro do mesmo gesto
   * do usuário (é isso que mantém o foco vivo no WebView do Android).
   */
  function trocarAba(nova: Aba) {
    setAba(nova);
    window.setTimeout(() => {
      gradeRef.current
        ?.querySelector<HTMLButtonElement>('[data-tv-key]')
        ?.focus({ preventScroll: true });
    }, 30);
  }

  /**
   * ── NAVEGAÇÃO POR D-PAD, LINHA A LINHA ─────────────────────────────────────
   *
   * CAUSA RAIZ (bug do login da TV): o teclado na tela dependia SÓ da navegação
   * espacial global do `useTvNavigation` para andar entre as teclas. Como o
   * formulário de TV (o teclado mora dentro dele) bloqueia a navegação global para
   * as teclas de digitação não serem interceptadas, o movimento entre as teclas
   * passou a ser responsabilidade DESTE componente.
   *
   * A navegação é determinística: cada LINHA do teclado é percorrida na horizontal
   * (◀ ▶ com parada nas pontas, sem "vazar" para outra linha) e `▲ ▼` sobem e
   * descem UMA linha, mantendo a COLUNA aproximada — que é o que o usuário espera
   * de um teclado de TV.
   */
  function linhasDaGrade(): HTMLButtonElement[][] {
    const grade = gradeRef.current;
    if (!grade) return [];
    return Array.from(grade.querySelectorAll<HTMLElement>('.tv-keyboard-row')).map((l) =>
      Array.from(l.querySelectorAll<HTMLButtonElement>('[data-tv-key]')),
    );
  }

  /** Foca um elemento pelo gesto atual (sem blur: o foco nunca fica órfão). */
  function focar(el: HTMLElement | null | undefined) {
    el?.focus({ preventScroll: true });
  }

  /**
   * Anda na direção pedida. Devolve `true` quando o movimento foi resolvido
   * DENTRO do teclado — só quando ele devolve `false` a tela externa assume
   * (voltar ao campo, ir ao "Entrar"), e é aí que a cadeia de foco fecha.
   */
  function mover(dir: 'left' | 'right' | 'up' | 'down'): boolean {
    const ativo = document.activeElement as HTMLElement | null;
    if (!ativo) return false;

    // Na barra de ABAS (ABC / 123 / #+& / Fechar): ◀ ▶ trocam de aba; ▼ desce
    // para a grade de letras.
    if (abasRef.current?.contains(ativo)) {
      if (dir === 'down') {
        focar(linhasDaGrade()[0]?.[0]);
        return true;
      }
      const abas = Array.from(
        abasRef.current.querySelectorAll<HTMLButtonElement>('[data-tv-key]'),
      );
      const i = abas.indexOf(ativo as HTMLButtonElement);
      if (i < 0) return false;
      if (dir === 'left' && i > 0) {
        focar(abas[i - 1]);
        return true;
      }
      if (dir === 'right' && i < abas.length - 1) {
        focar(abas[i + 1]);
        return true;
      }
      return true;
    }

    // Na linha de FUNÇÕES (Espaço / ⇧ / Apagar / Limpar / Entrar).
    if (funcoesRef.current?.contains(ativo)) {
      const funcoes = Array.from(
        funcoesRef.current.querySelectorAll<HTMLButtonElement>('[data-tv-key]'),
      );
      const i = funcoes.indexOf(ativo as HTMLButtonElement);
      if (i < 0) return false;
      if (dir === 'left' && i > 0) {
        focar(funcoes[i - 1]);
        return true;
      }
      if (dir === 'right' && i < funcoes.length - 1) {
        focar(funcoes[i + 1]);
        return true;
      }
      if (dir === 'up') {
        const linhas = linhasDaGrade();
        focar(linhas[linhas.length - 1]?.[0]);
        return true;
      }
      // `down` na última linha sai do teclado → a ação do formulário assume.
      return false;
    }

    // Na GRADE de teclas: linha a linha, coluna aproximada.
    const linhas = linhasDaGrade();
    let li = -1;
    let ci = -1;
    for (let l = 0; l < linhas.length; l++) {
      const c = linhas[l].indexOf(ativo as HTMLButtonElement);
      if (c >= 0) {
        li = l;
        ci = c;
        break;
      }
    }
    if (li < 0) return false;

    if (dir === 'left') {
      if (ci > 0) {
        focar(linhas[li][ci - 1]);
        return true;
      }
      return true; // ponta esquerda: fica (não vaza para a coluna lateral).
    }
    if (dir === 'right') {
      if (ci < linhas[li].length - 1) {
        focar(linhas[li][ci + 1]);
        return true;
      }
      return true; // ponta direita: fica.
    }
    if (dir === 'up') {
      if (li > 0) {
        const destino = linhas[li - 1];
        focar(destino[Math.min(ci, destino.length - 1)]);
        return true;
      }
      // Primeira linha: sobe para a barra de abas (dentro do próprio teclado).
      focar(abasRef.current?.querySelector<HTMLButtonElement>('[data-tv-key]'));
      return true;
    }
    // `down`: desce uma linha; na última, vai para a linha de funções; se já
    // estiver nela, devolve `false` e a AÇÃO do formulário assume o foco.
    if (li < linhas.length - 1) {
      const destino = linhas[li + 1];
      focar(destino[Math.min(ci, destino.length - 1)]);
      return true;
    }
    focar(funcoesRef.current?.querySelector<HTMLButtonElement>('[data-tv-key]'));
    return true;
  }

  /**
   * Teclas do teclado na tela. As SETAS são resolvidas aqui (determinísticas); o
   * Enter/OK segue o fluxo normal do botão focado; o Escape/Voltar fecha.
   *
   * Importante: só consomem a tecla quando o movimento é resolvido DENTRO do
   * teclado — nas bordas a tecla é repassada à tela externa, que fecha a cadeia.
   */
  function teclas(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented) return;
    const c = e.nativeEvent.keyCode || e.nativeEvent.which;
    const esq = e.key === 'ArrowLeft' || e.key === 'Left' || c === 37 || c === 21;
    const dir = e.key === 'ArrowRight' || e.key === 'Right' || c === 39 || c === 22;
    const cima = e.key === 'ArrowUp' || e.key === 'Up' || c === 38 || c === 19;
    const baixo = e.key === 'ArrowDown' || e.key === 'Down' || c === 40 || c === 20;
    const sair = e.key === 'Escape' || e.key === 'GoBack' || c === 27 || c === 4 || c === 461;

    if (sair) {
      e.preventDefault();
      e.stopPropagation();
      onSair?.('escapar');
      return;
    }
    if (!esq && !dir && !cima && !baixo) return;

    const resolvido = mover(esq ? 'left' : dir ? 'right' : cima ? 'up' : 'down');
    if (resolvido) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Borda: a tela externa fecha a cadeia (campo ativo / botão Entrar).
    e.preventDefault();
    e.stopPropagation();
    onSair?.(cima ? 'cima' : 'baixo');
  }

  return (
    <div
      ref={raizRef}
      className="tv-login-teclado"
      role="group"
      aria-label="Teclado na tela"
      onKeyDown={teclas}
    >
      {/* Abas: alcançáveis com ← → como qualquer controle (data-tv-focusable). */}
      <div
        ref={abasRef}
        className="tv-keyboard-row tv-keyboard-abas"
        role="tablist"
        aria-label="Tipo de caractere"
      >
        {(Object.keys(LINHAS) as Aba[]).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            data-tv-key={`aba-${a}`}
            data-tv-focusable
            tabIndex={0}
            className={cn('tv-key', 'tv-key-aba', aba === a && 'tv-key-ativo')}
            onClick={() => trocarAba(a)}
          >
            {ROTULO_ABA[a]}
          </button>
        ))}
        {onFechar ? (
          <button
            type="button"
            data-tv-key="fechar"
            data-tv-focusable
            tabIndex={0}
            className={cn('tv-key', 'tv-key-fn', 'tv-key-larga')}
            onClick={onFechar}
          >
            ⌨ Fechar
          </button>
        ) : null}
      </div>

      <div ref={gradeRef} className="tv-keyboard-grade">
        {LINHAS[aba].map((linha, li) => (
          <div key={`${aba}-${li}`} className="tv-keyboard-row">
            {linha.map((t) => (
              <button
                key={`${aba}-${t}`}
                type="button"
                data-tv-key={t}
                data-tv-focusable
                tabIndex={0}
                className="tv-key"
                onClick={() => enviar(t)}
              >
                {t}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div ref={funcoesRef} className="tv-keyboard-row">
        <button
          type="button"
          data-tv-key="espaco"
          data-tv-focusable
          tabIndex={0}
          className="tv-key tv-key-space"
          onClick={() => onTecla(' ')}
        >
          Espaço
        </button>
        <button
          type="button"
          data-tv-key="maiuscula"
          data-tv-focusable
          tabIndex={0}
          aria-pressed={maiuscula}
          className={cn('tv-key', 'tv-key-fn', maiuscula && 'tv-key-ativo')}
          onClick={() => setMaiuscula((v) => !v)}
        >
          ⇧
        </button>
        <button
          type="button"
          data-tv-key="apagar"
          data-tv-focusable
          tabIndex={0}
          className={cn('tv-key', 'tv-key-fn', 'tv-key-larga')}
          onClick={onApagar}
        >
          ⌫ Apagar
        </button>
        <button
          type="button"
          data-tv-key="limpar"
          data-tv-focusable
          tabIndex={0}
          className={cn('tv-key', 'tv-key-fn', 'tv-key-larga')}
          onClick={onLimpar}
        >
          Limpar
        </button>
        <button
          type="button"
          data-tv-key="entrar"
          data-tv-focusable
          tabIndex={0}
          className={cn('tv-key', 'tv-key-entrar')}
          onClick={onEntrar}
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
