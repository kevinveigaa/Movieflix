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

export function TvKeyboard({ onTecla, onApagar, onLimpar, onEntrar, onFechar }: TvKeyboardProps) {
  // Começa em minúsculas (e-mail costuma ser minúsculo). ⇧ = uma letra.
  const [maiuscula, setMaiuscula] = useState(false);
  const [aba, setAba] = useState<Aba>('letras');
  const gradeRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="tv-login-teclado" role="group" aria-label="Teclado na tela">
      {/* Abas: alcançáveis com ← → como qualquer controle (data-tv-focusable). */}
      <div className="tv-keyboard-row tv-keyboard-abas" role="tablist" aria-label="Tipo de caractere">
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

      <div className="tv-keyboard-row">
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
