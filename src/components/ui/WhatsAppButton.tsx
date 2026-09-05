import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { abrirWhatsAppNoApp, ehAppSincrono } from '@/lib/appShell';

/**
 * WhatsAppButton — botão de assinatura/troca/renovação que abre o WhatsApp
 * OFICIAL do MovieFlix de forma FINAL e segura, TANTO no navegador QUANTO no
 * app (APK/Capacitor).
 *
 * Garantias:
 *  - NAVEGADOR: é um <a href target="_blank" rel="noopener"> REAL — preserva o
 *    gesto de usuário, o navegador abre o WhatsApp numa NOVA aba e o site NUNCA
 *    fecha, recarrega, volta para a última página nem redireciona internamente.
 *  - APP (APK/Capacitor): o WebView do app tem `setSupportMultipleWindows(false)`,
 *    então `target="_blank"` é SILENCIOSAMENTE IGNORADO (não abre janela nem
 *    navega o main frame). Para abrir o WhatsApp de forma CONFIÁVEL no app,
 *    chamamos a ponte nativa `MovieFlixApp.abrirWhatsApp(url)`, que valida a URL
 *    (só o WhatsApp oficial) e dispara o intent ACTION_VIEW diretamente — abre
 *    o WhatsApp FORA do WebView, sem bloquear, sem voltar, sem prender o usuário.
 *  - BLOQUEIA CLIQUE DUPLICADO: após o primeiro clique, o botão entra em
 *    "abrindo..." e ignora cliques subsequentes por um curto intervalo — o
 *    WhatsApp abre UMA única vez (sem múltiplas abas/chamadas).
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
    // Libera o bloqueio após um curto intervalo (permite nova tentativa
    // deliberada do usuário, mas não cliques acidentais em sequência).
    window.setTimeout(() => {
      bloqueado.current = false;
      setAbrindo(false);
    }, 1500);

    // DENTRO DO APP (APK/Capacitor): o WebView ignora target="_blank"
    // (setSupportMultipleWindows(false)). Chamamos a ponte nativa, que abre o
    // WhatsApp FORA do WebView via intent. Previne o comportamento padrão do
    // <a> (que não faria nada no app) para não duplicar a abertura.
    if (ehAppSincrono()) {
      e.preventDefault();
      e.stopPropagation();
      void abrirWhatsAppNoApp(href);
      return;
    }

    // NAVEGADOR: NÃO chamamos preventDefault no primeiro clique — o navegador
    // segue o href (target="_blank") e abre o WhatsApp numa nova aba. Nenhum
    // redirect automático.
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