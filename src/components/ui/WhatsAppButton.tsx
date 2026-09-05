import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { abrirWhatsApp } from '@/lib/whatsapp';

/**
 * WhatsAppButton — botão de assinatura/troca/renovação.
 *
 * FLUXO ÚNICO (todos os ambientes): abre DIRETAMENTE o WhatsApp oficial do
 * MovieFlix (api.whatsapp.com/send?phone=5511943750307&text=...) com a mensagem
 * pré-preenchida correspondente ao plano escolhido. SEM página intermediária de
 * assinatura, SEM aviso, SEM redirecionamento para o navegador.
 *
 *  - NAVEGADOR (site): usa `abrirWhatsApp` — tenta o deep link nativo
 *    `whatsapp://send` (abre direto a conversa se o WhatsApp estiver instalado)
 *    e cai para o link https (WhatsApp Web) se o scheme não for reconhecido.
 *  - APP (APK/Capacitor): o WebView ignora target="_blank", então o clique
 *    chama a ponte nativa MovieFlixApp.abrirWhatsApp(url) — o WhatsApp abre
 *    DIRETO no celular, fora do WebView.
 */

export function WhatsAppButton({
  href,
  children,
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  variant?: 'primary' | 'outline';
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const bloqueado = useRef(false);

  function aoClicar(e: MouseEvent<HTMLAnchorElement>) {
    // Bloqueia cliques duplicados por um curto intervalo.
    if (bloqueado.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    bloqueado.current = true;
    setAbrindo(true);
    window.setTimeout(() => {
      bloqueado.current = false;
      setAbrindo(false);
    }, 1500);

    // Abre o WhatsApp de forma confiável em TODOS os ambientes (navegador e
    // app) — a função centralizada cuida do deep link nativo, do fallback
    // https e da ponte nativa do app. Sempre preventDefault para não depender
    // do comportamento do href (que o WebView do app ignora).
    e.preventDefault();
    e.stopPropagation();
    void abrirWhatsApp(href);
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={aoClicar}
      aria-label={ariaLabel}
      data-tv-focusable
      className={className}
    >
      <MessageCircle className="h-4 w-4" />
      {abrindo ? 'Abrindo…' : children}
    </a>
  );
}
