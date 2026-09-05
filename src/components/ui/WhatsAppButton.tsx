import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { abrirNoNavegador, ehAppSincrono } from '@/lib/appShell';

/**
 * WhatsAppButton — botão de assinatura/troca/renovação.
 *
 * FLUXO POR AMBIENTE:
 *  - NAVEGADOR (site): é um <a href target="_blank" rel="noopener"> REAL — o
 *    navegador abre o WhatsApp numa NOVA aba com a mensagem pré-preenchida
 *    (e-mail + plano + valor). O site NUNCA fecha, recarrega, volta para a
 *    última página nem redireciona internamente.
 *  - APP (APK/Capacitor): o WebView do app tem `setSupportMultipleWindows(false)`,
 *    então `target="_blank"` é SILENCIOSAMENTE IGNORADO e o WhatsApp não abre
 *    dentro do WebView. NOVO FLUXO: ao clicar, o app mostra um AVISO informando
 *    que é preciso acessar a página de assinatura no site para enviar a
 *    mensagem automática no WhatsApp, e então REDIRECIONA para a página de
 *    assinatura do site (https://movieflix-bszf.onrender.com/#/minha-assinatura)
 *    ABERTA NO NAVEGADOR EXTERNO do celular (via intent nativo, fora do
 *    WebView). Dentro do site (navegador), a pessoa clica e manda a mensagem
 *    automática no WhatsApp normalmente.
 *
 * Garantias:
 *  - BLOQUEIA CLIQUE DUPLICADO: após o primeiro clique, o botão entra em
 *    "abrindo..." e ignora cliques subsequentes por um curto intervalo.
 *  - NÃO há polling, timer, callback ou redirect automático depois de abrir.
 *  - O antiAds permite explicitamente wa.me/whatsapp.com/whatsapp:// (via
 *    isAllowedExternalUrl), então a proteção global continua ativa.
 */

/** URL da página de assinatura do site (aberta no navegador externo no app). */
export const PAGINA_ASSINATURA_URL = 'https://movieflix-bszf.onrender.com/#/minha-assinatura';

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
    // (setSupportMultipleWindows(false)) e o WhatsApp não abre dentro do
    // WebView. Novo fluxo: mostra um aviso e redireciona para a página de
    // assinatura do site, aberta no NAVEGADOR EXTERNO do celular (via ponte
    // nativa), onde o WhatsApp funciona normalmente.
    if (ehAppSincrono()) {
      e.preventDefault();
      e.stopPropagation();
      // Aviso ao usuário antes de redirecionar.
      const ok = window.confirm(
        'Para enviar a mensagem automática no WhatsApp, é preciso acessar a página de assinatura no site. Deseja abrir no navegador?'
      );
      if (ok) {
        void abrirNoNavegador(PAGINA_ASSINATURA_URL);
      }
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
      {abrindo ? 'Abrindo…' : children}
    </a>
  );
}