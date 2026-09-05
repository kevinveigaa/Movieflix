import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { marcarWhatsAppAberto } from '@/lib/antiAds';

/**
 * WhatsAppButton — botão de assinatura/troca/renovação que abre o WhatsApp
 * OFICIAL do MovieFlix de forma FINAL e segura.
 *
 * Garantias:
 *  - É um <a href target="_blank" rel="noopener"> REAL: preserva o gesto de
 *    usuário, o navegador abre o WhatsApp numa NOVA aba e o site NUNCA fecha,
 *    recarrega, volta para a última página nem redireciona internamente.
 *  - BLOQUEIA CLIQUE DUPLICADO: após o primeiro clique, o botão entra em
 *    "abrindo..." e ignora cliques subsequentes por um curto intervalo —
 *    o WhatsApp abre UMA única vez (sem múltiplas abas/chamadas).
 *  - NÃO há polling, timer, callback ou redirect automático depois de abrir:
 *    o clique é o redirecionamento FINAL para o WhatsApp.
 *  - O antiAds permite explicitamente wa.me/whatsapp.com/whatsapp:// (via
 *    isAllowedExternalUrl), então a proteção global continua ativa.
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
    // Bloqueia cliques duplicados: se já abriu, cancela os próximos.
    if (bloqueado.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    bloqueado.current = true;
    setAbrindo(true);
    // Informa o antiAds que o WhatsApp oficial foi aberto legitimamente: o
    // guard de redirect/beforeunload NÃO deve restaurar a página (o WhatsApp
    // é o destino FINAL — sem voltar para a última página/Mercado Pago).
    marcarWhatsAppAberto();
    // Libera o bloqueio após um curto intervalo (permite nova tentativa
    // deliberada do usuário, mas não cliques acidentais em sequência).
    window.setTimeout(() => {
      bloqueado.current = false;
      setAbrindo(false);
    }, 1500);
    // NÃO chamamos preventDefault no primeiro clique: o navegador segue o
    // href (target=_blank) e abre o WhatsApp. Nenhum redirect automático.
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
      {abrindo ? 'Abrindo WhatsApp…' : children}
    </a>
  );
}