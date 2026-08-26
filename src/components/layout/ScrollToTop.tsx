import { useCallback, useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Botão "voltar ao topo" (seta flutuante).
 *
 * Histórico de bugs:
 * - Em alguns WebViews (Android TV / TV Box / WebView antigo) e no Safari,
 *   `window.scrollTo({ top: 0, behavior: 'smooth' })` falha SILENCIOSAMENTE:
 *   as opções com `behavior` não são suportadas e o scroll não acontece.
 *   Correção: detectar suporte a `scrollBehavior` (via `document.documentElement.style`)
 *   e cair para `window.scrollTo(0, 0)` (ou `scrollTop = 0`) quando não houver.
 * - Fallback adicional: rolar `document.documentElement` e `document.body`
 *   diretamente, cobrindo ambientes onde o scroll acontece em outro elemento.
 * - `scroll-behavior: smooth` via CSS é aplicado no :root para que o fallback
 *   (sem suporte a options) ainda role suavemente onde o CSS é respeitado.
 */

/** O ambiente suporta `window.scrollTo({ top, behavior: 'smooth' })`? */
function suportaScrollSuave(): boolean {
  return (
    typeof window !== 'undefined' &&
    'scrollBehavior' in document.documentElement.style
  );
}

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const rolarParaTopo = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (suportaScrollSuave()) {
      // Caminho preferido: rolagem suave nativa (Chrome, Edge, Firefox, TV Box moderno).
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } else {
      // Fallback para WebViews/Safari antigos que ignoram options: rolagem
      // direta e instantânea, ainda suavizada pelo CSS `scroll-behavior: smooth`
      // quando o navegador suporta a propriedade.
      try {
        window.scrollTo(0, 0);
      } catch {
        /* noop */
      }
    }

    // Reforço: em raros casos (containers com overflow próprios) o scroll do
    // window não cobre; zera também os elementos de scroll clássicos.
    const doc = document.documentElement;
    const body = document.body;
    if (doc && doc.scrollTop > 0) doc.scrollTop = 0;
    if (body && body.scrollTop > 0) body.scrollTop = 0;
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={rolarParaTopo}
      onPointerUp={rolarParaTopo}
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-gradient-to-r from-brand-600 via-roxo-600 to-roxo-600 text-white shadow-lg shadow-roxo-900/40 transition-all hover:scale-110 hover:from-brand-500 hover:via-roxo-500 hover:to-roxo-500 active:scale-95"
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
    >
      <ArrowUp className="pointer-events-none h-5 w-5" />
    </button>
  );
}
