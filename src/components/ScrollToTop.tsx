import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop — garante que TODA navegação de rota comece no topo (SCROLL Y = 0).
 *
 * Corrige o problema em que a página de detalhes (filme/série/temporada/episódio)
 * abria em posição mais baixa ao clicar num card. Causa raiz: o HashRouter não
 * restaura o scroll e o navegador mantém a posição anterior ao trocar de rota.
 *
 * - Desativa a restauração automática do navegador (scrollRestoration = 'manual').
 * - A cada mudança de pathname, rola para o topo imediatamente (e de novo após
 *   um tick, para cobrir renderização assíncrona de conteúdo).
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Impede o navegador de restaurar a posição de scroll ao navegar (SPA).
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // Segundo tick: cobre conteúdo que monta de forma assíncrona (lazy).
    const t = window.setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}