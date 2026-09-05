import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { abrirWhatsAppNoApp, ehAppSincrono } from '@/lib/appShell';

/**
 * WhatsAppButton — botão de assinatura/troca/renovação.
 *
 * FLUXO ÚNICO (todos os ambientes): abre DIRETAMENTE o WhatsApp oficial do
 * MovieFlix (wa.me/5511943750307) com a mensagem pré-preenchida correspondente
 * ao plano escolhido. SEM página intermediária de assinatura, SEM aviso,
 * SEM redirecionamento para o navegador.
 *
 *  - NAVEGADOR (site): <a href target="_blank"> real — abre numa NOVA aba.
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

    // DENTRO DO APP: abre o WhatsApp DIRETAMENTE via ponte nativa.
    if (ehAppSincrono()) {
      e.preventDefault();
      e.stopPropagation();
      void abrirWhatsAppNoApp(href);
      return;
    }

    // NAVEGADOR: sem preventDefault — o navegador segue o href (nova aba).
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
