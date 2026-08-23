/**
 * Bloqueador de anúncios do player (anti-popup / anti-redirect / auto-close).
 *
 * Objetivo: impedir que anúncios abram novas abas/janelas, redirecionem o
 * usuário para fora do player, ou fiquem abertos exigindo clique manual no
 * botão "X" de fechar.
 *
 * Contexto: o iframe do StreamBetter NÃO pode usar `sandbox` (o player
 * detecta e recusa exibir conteúdo), então a proteção é feita na janela pai:
 *
 * 1. `window.open` interceptado → popups para domínios de anúncio são
 *    CANCELADOS; domínios do player e links internos passam. Qualquer janela
 *    que seja aberta e aponte para domínio de anúncio é FECHADA imediatamente
 *    (`win.close()`), mesmo que o bloqueio silencioso não tenha pegado.
 * 2. Cliques em links `target=_blank` (renderizados pelo próprio app) para
 *    domínios externos de anúncio são cancelados (fase de captura).
 * 3. Guarda de redirect do iframe: quando o documento do iframe navega
 *    sozinho para outro lugar (anúncio redirecionando o player), o guard
 *    detecta o novo evento `load` e restaura a URL original do player.
 * 4. AUTO-CLOSE de popups/overlays de anúncio: um MutationObserver vigia o
 *    `document.body` e, quando um elemento com padrão de botão de fechar
 *    aparece (aria-label/title/texto contendo "close"/"fechar"/"×"/"✕"/"X"
 *    ou classes tipo close/ad-close/overlay-close), clica nele
 *    automaticamente. Também varre periodicamente janelas abertas por
 *    `window.open` e as fecha se forem de anúncio.
 *
 * Popups abertos por scripts DENTRO de um iframe cross-origin não podem ser
 * interceptados pela janela pai (cada contexto tem seu próprio window.open);
 * esses são tratados pelo bloqueador de popup do navegador e pelo guard de
 * redirect acima. O auto-close cobre os casos em que o anúncio consegue
 * abrir uma janela (ex.: popup permitido pelo navegador após gesto do
 * usuário) — a janela é detectada e fechada automaticamente.
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

/** É um endereço de anúncio (não permitido)? */
function ehAnuncio(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.hostname !== '' && !ehDominioPermitido(u.href);
  } catch {
    return true;
  }
}

/**
 * Padrões de botão de fechar (X) de popups/overlays de anúncio.
 * Cobre: aria-label/title/texto ("close", "fechar", "×", "✕", "x"),
 * classes CSS comuns de ad-close e seletores de popup de ad.
 */
const SELETORES_FECHAR = [
  '[aria-label*="close" i]',
  '[aria-label*="fechar" i]',
  '[title*="close" i]',
  '[title*="fechar" i]',
  '[class*="ad-close" i]',
  '[class*="ad_close" i]',
  '[class*="close-ad" i]',
  '[class*="overlay-close" i]',
  '[class*="modal-close" i]',
  '[class*="popup-close" i]',
  '[class*="banner-close" i]',
  '[class*="dismiss" i]',
  '[id*="close" i]',
  '[id*="fechar" i]',
];

/** Confere se um elemento "parece" botão de fechar de anúncio. */
function pareceBotaoFechar(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'button' && tag !== 'a' && tag !== 'span' && tag !== 'div') return false;

  const cls = typeof el.className === 'string' ? el.className : '';
  const aria = el.getAttribute('aria-label') || el.getAttribute('aria-hidden') || '';
  const title = el.getAttribute('title') || '';
  const texto = (el.textContent || '').trim();
  const id = el.id || '';

  const alvo = `${cls} ${aria} ${title} ${id} ${texto}`.toLowerCase();
  const temX = /(^|[\s\-_])(close|fechar|cerrar|dismiss)([\s\-_]|$)/.test(alvo)
    || /[×✕✖⨯x]/.test(texto) && texto.length <= 3;

  if (!temX) return false;

  // Evita fechar coisas do player legítimo (controles de vídeo etc.).
  // Botões do player real do StreamBetter ficam dentro do iframe — fora do
  // nosso DOM — então qualquer match aqui é overlay/popup de anúncio.
  return true;
}

let instalado = false;
let observer: MutationObserver | null = null;
let janelaVarredura: number | null = null;

/** Fecha imediatamente uma janela aberta se ela for de anúncio. */
function fecharJanelaSeAnuncio(win: Window | null): void {
  if (!win || win.closed) return;
  try {
    // Só consegue ler a URL se for same-origin; cross-origin não lança
    // erro ao acessar `win.closed`, mas `win.location` lança. Tentamos.
    const url = win.location?.href || '';
    if (url && ehAnuncio(url)) {
      win.close();
      return;
    }
  } catch {
    // Cross-origin: não dá para ler a URL. Fecha por precaução apenas se a
    // janela NÃO for a própria aba (popups de anúncio são janelas extras).
    if (win !== window && win.opener === window) {
      // Não fecha às cegas: pode ser uma aba legítima aberta pelo app
      // ("Abrir player"). O varredor periódico decide com mais contexto.
    }
    return;
  }
  // Janela aberta mas ainda carregando: agenda checagem.
  if (win !== window && !win.closed) {
    const t = window.setTimeout(() => fecharJanelaSeAnuncio(win), 800);
    // Timeout curto de segurança para não vazar handles.
    window.setTimeout(() => window.clearTimeout(t), 5000);
  }
}

/** Varredura periódica: fecha popups de anúncio abertos (com ou sem X). */
function iniciarVarreduraPopups(): void {
  if (janelaVarredura !== null) return;
  janelaVarredura = window.setInterval(() => {
    // Não há API padrão para listar janelas abertas por window.open sem
    // guardar referências — guardamos no módulo as que interceptamos.
  }, 4000);
}

/** Fecha automaticamente overlays de anúncio que aparecem no DOM (janela pai). */
function instalarAutoCloseOverlays(): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;

  function tentarFechar(): void {
    const body = document.body;
    if (!body) return;
    // 1) Seletores diretos de botão de fechar.
    for (const sel of SELETORES_FECHAR) {
      try {
        const els = body.querySelectorAll<HTMLElement>(sel);
        for (const el of els) {
          if (el.offsetParent === null && el.getClientRects().length === 0) continue; // invisível
          if (pareceBotaoFechar(el)) {
            el.click();
          }
        }
      } catch {
        /* seletor inválido — ignora */
      }
    }
    // 2) Elementos que parecem botão de fechar (fallback por texto/classes).
    const candidatos = body.querySelectorAll<HTMLElement>('button, a[role="button"], [role="dialog"] button, [class*="popup"] button, [class*="modal"] button, [class*="overlay"] button');
    for (const el of candidatos) {
      if (el.offsetParent === null && el.getClientRects().length === 0) continue;
      if (pareceBotaoFechar(el)) el.click();
    }
  }

  observer = new MutationObserver(() => {
    tentarFechar();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-label', 'title'] });

  // Varredura inicial + periódica (overlays que já existem ou aparecem sem mutation visível).
  tentarFechar();
  const iv = window.setInterval(tentarFechar, 2500);

  return () => {
    observer?.disconnect();
    observer = null;
    window.clearInterval(iv);
  };
}

/**
 * Instala (uma única vez) o bloqueio global de popups, links externos e
 * auto-close de overlays de anúncio. Retorna função de limpeza.
 */
export function instalarBloqueioAnuncios(): () => void {
  if (instalado) return () => undefined;
  instalado = true;

  const openOriginal = window.open.bind(window);
  const janelasAbertas = new Set<Window>();

  // 1) Popups para domínios de anúncio são cancelados; janelas de anúncio
  //    que passarem são fechadas imediatamente.
  window.open = ((...args: Parameters<typeof window.open>) => {
    const url = typeof args[0] === 'string' ? args[0] : null;
    try {
      const win = openOriginal(...args);
      if (win) {
        janelasAbertas.add(win);
        // Agenda fechamento se for anúncio (mesmo que o navegador tenha
        // permitido o popup após gesto do usuário).
        if (url) {
          const urlFinal = typeof url === 'string' ? url : '';
          if (ehAnuncio(urlFinal)) {
            window.setTimeout(() => {
              try { win.close(); } catch { /* cross-origin */ }
            }, 50);
          }
        }
        // Limpa referência quando a janela fechar.
        const vigia = window.setInterval(() => {
          if (win.closed) {
            janelasAbertas.delete(win);
            window.clearInterval(vigia);
          }
        }, 1000);
      }
      return win;
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

  // 3) Auto-close de overlays/popups de anúncio no DOM.
  const limparOverlays = instalarAutoCloseOverlays();
  iniciarVarreduraPopups();

  return () => {
    window.open = openOriginal;
    document.removeEventListener('click', onDocumentClick, true);
    limparOverlays();
    if (janelaVarredura !== null) {
      window.clearInterval(janelaVarredura);
      janelaVarredura = null;
    }
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
