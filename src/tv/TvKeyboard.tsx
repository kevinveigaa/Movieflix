import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * TvKeyboard — teclado VIRTUAL de TV, navegável apenas com o D-pad.
 *
 * POR QUE ELE EXISTE (causa raiz do bug "não consigo digitar no login da TV"):
 * nas TVs/TV Box o teclado virtual DO SISTEMA (IME) só sobe quando o WebView
 * recebe um gesto real do usuário — e o foco que a navegação espacial dá aos
 * campos é PROGRAMÁTICO. O campo ficava com o anel de foco, mas o teclado nunca
 * aparecia. Além disso, esconder a status bar em modo fullscreen suprime o IME
 * em várias versões do Android (§ ver MainActivity.aplicarModoImersivo).
 *
 * Este teclado NÃO depende de IME nenhum: cada tecla é um <button> que a
 * navegação espacial (setas + OK) alcança e aciona como qualquer outro
 * elemento focável da TV. É o mesmo padrão que já funcionava no TvSearchPage.
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
}

const LINHAS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '@', '.', '-'],
];

function ehLetra(t: string): boolean {
  return /^[A-Za-zÇç]$/.test(t);
}

export function TvKeyboard({ onTecla, onApagar, onLimpar, onEntrar }: TvKeyboardProps) {
  // Começa em minúsculas (e-mail costuma ser minúsculo). ⇧ = uma letra.
  const [maiuscula, setMaiuscula] = useState(false);

  function enviar(t: string) {
    if (ehLetra(t)) {
      onTecla(maiuscula ? t.toUpperCase() : t.toLowerCase());
      if (maiuscula) setMaiuscula(false);
      return;
    }
    onTecla(t);
  }

  return (
    <div className="tv-login-teclado" role="group" aria-label="Teclado na tela">
      {LINHAS.map((linha, li) => (
        <div key={li} className="tv-keyboard-row">
          {linha.map((t) => (
            <button
              key={t}
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
