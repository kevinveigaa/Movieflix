/**
 * Bloqueador de anúncios do player (anti-popup / anti-redirect).
 *
 * Objetivo: impedir que anúncios abram novas abas/janelas ou redirecionem
 * o usuário para fora do player.
 *
 * Contexto: o iframe do StreamBetter NÃO pode usar `sandbox` (o player
 * detecta e recusa exibir conteúdo), então a proteção é feita na janela pai:
 *
 * 1. `window.open` interceptado → popups para domínios de anúncio são
 *    cancelados; domínios do player e links internos passam.
 * 2. Cliques em links `target=_blank` (renderizados pelo próprio app) para
 *    domínios externos de anúncio são cancelados (fase de captura).
 * 3. Guarda de redirect do iframe: quando o documento do iframe navega
 *    sozinho para outro lugar (anúncio redirecionando o player), o guard
 *    detecta o novo evento `load` e restaura a URL original do player.
 *
 * Popups abertos por scripts DENTRO de um iframe cross-origin não podem ser
 * interceptados pela janela pai (cada contexto tem seu próprio window.open);
 * esses são tratados pelo bloqueador de popup do próprio navegador (sem
 * gesto do usuário → bloqueado) e pelo guard de redirect acima.
 */

const DOMINIOS_PERMITIDOS = [
  'streambetter.shop',
  'playerflixapi.com',
  'megaembedapi.site',
  'embedplayapi.site',
  'watchplayer.shop',
  'embedplayer2.xyz',
  'embed.warezcdn.link',
  'superflixapi.life',
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'drive.google.com',
];

/** A URL pode ser aberta (domínio do player ou navegação interna do app)? */
export function ehDominioPermitido(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    if (u.origin === window.location.origin) return true;
    if (!u.hostname) return false;
    return DOMINIOS_PERMITIDOS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

let instalado = false;

/**
 * Instala (uma única vez) o bloqueio global de popups e links externos.
 * Retorna uma função de limpeza (por simetria; o app vive a vida toda).
 */
export function instalarBloqueioAnuncios(): () => void {
  if (instalado) return () => undefined;
  instalado = true;

  const openOriginal = window.open.bind(window);

  // 1) Popups para domínios de anúncio são cancelados silenciosamente.
  window.open = ((...args: Parameters<typeof window.open>) => {
    const url = typeof args[0] === 'string' ? args[0] : null;
    if (url && !ehDominioPermitido(url)) {
      return null;
    }
    try {
      return openOriginal(...args);
    } catch {
      return null;
    }
  }) as typeof window.open;

  // 2) Links externos com target=_blank renderizados pelo app.
  function onDocumentClick(e: MouseEvent) {
    const alvo = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!alvo) return;
    const href = alvo.getAttribute('href') || '';
    const abreNovaAba = alvo.target === '_blank' || alvo.target === '_top' || alvo.rel?.includes('external');
    if (!abreNovaAba) return;
    if (href.startsWith('/') || href.startsWith('#') || href.startsWith('?')) return;
    if (ehDominioPermitido(href)) return;
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener('click', onDocumentClick, true);

  return () => {
    window.open = openOriginal;
    document.removeEventListener('click', onDocumentClick, true);
    instalado = false;
  };
}

/**
 * Guarda de redirect do iframe do player.
 *
 * Quando um anúncio redireciona o DOCUMENTO do iframe para fora do player
 * (mudança de página dentro do próprio iframe), um novo evento `load`
 * dispara no elemento <iframe> sem que a `src` original tenha mudado.
 * Detectamos isso e restauramos a URL do player (máx. 3 restaurações por
 * 2 minutos para evitar loop se o player navegar legitimamente).
 */
export function protegerIframeContraRedirect(
  iframe: HTMLIFrameElement,
  srcOriginal: string,
): () => void {
  let cargas = 0;
  let restauracoes = 0;
  let janelaInicio = Date.now();
  let esperado = srcOriginal;

  function resetarJanela() {
    janelaInicio = Date.now();
    restauracoes = 0;
  }

  function onLoad() {
    cargas += 1;
    // Primeira carga = conteúdo inicial do player; deixa passar.
    if (cargas <= 1) return;
    if (Date.now() - janelaInicio > 120_000) resetarJanela();

    // Se a src do atributo ainda é a do player e o documento navegou de novo,
    // é um redirect de anúncio dentro do iframe → restaura o player.
    if (restauracoes < 3 && iframe.getAttribute('src') === esperado) {
      restauracoes += 1;
      iframe.setAttribute('src', esperado);
    }
  }

  iframe.addEventListener('load', onLoad);
  return () => iframe.removeEventListener('load', onLoad);
}
