/**
 * Bloqueador TOTAL de anúncios / redirecionamentos do player (anti-popup /
 * anti-redirect / anti-navegação externa / auto-close).
 *
 * Objetivo: o usuário NUNCA deve sair do player/site por causa de anúncio.
 * Nenhuma redireção para fora do site é permitida, em nenhum mecanismo:
 *
 *  CAMADAS DE PROTEÇÃO (todas silenciosas — nenhum aviso/toast ao usuário):
 *  1. `window.open` interceptado → popups CANCELADOS (retorna null) para
 *     qualquer URL que não seja domínio permitido; janelas que abrirem mesmo
 *     assim são fechadas imediatamente.
 *  2. `window.location` / `location.assign` / `location.replace` / `href`
 *     interceptados → navegação para fora do app é CANCELADA (volta à URL
 *     original). Navegação interna (SPA, rotas do app) continua normal.
 *  3. Cliques em QUALQUER link externo (com ou sem target=_blank) cancelados
 *     na fase de captura. Links internos (/, #, ?) e domínios permitidos
 *     (player) passam. WhatsApp/Instagram do rodapé usam window.open com
 *     domínio permitido → continuam funcionando.
 *  4. `Meta refresh` e `window.location` via atributos: um MutationObserver
 *     remove tags <meta http-equiv="refresh"> externas e sanitiza o iframe
 *     do player quando ele tenta navegar para um host de anúncio.
 *  5. Guarda de redirect do IFRAME: quando o documento do iframe do player
 *     navega sozinho para outro host, o guard detecta o novo evento `load` e
 *     RESTAURA a URL original do player (contador global com janela 2min).
 *  6. Sanitização do iframe via `sandbox` SELETIVO: se o player recusar
 *     carregar com sandbox (StreamBetter detecta), o atributo é removido —
 *     mas o guard de redirect + as camadas 1-4 continuam protegendo.
 *  7. Bloqueio de `beforeunload`: quando uma navegação externa for tentada,
 *     o beforeunload é interceptado e cancelado, e a página original é
 *     restaurada imediatamente.
 *  8. Histórico: `history.pushState`/`replaceState` e `popstate`/`hashchange`
 *     são monitorados para impedir que um anúncio altere a URL do app.
 *
 * Contexto: o iframe do WatchPlayer NÃO pode usar `sandbox` permanente (o
 * player detecta e recusa exibir conteúdo). A proteção é feita na janela pai,
 * com as camadas acima.
 */

import { isAllowedExternalUrl } from '@/lib/whatsapp';
import { ehDeepLinkMovieFlix } from '@/lib/deepLink';

// Domínios de verificação do Cloudflare/Turnstile — NUNCA devem ser tocados
// (nem fechados, nem restaurados, nem sanitizados). O desafio roda DENTRO do
// iframe do player; interferir nele causa o loop "verificação → sucesso →
// volta à verificação" relatado no site. O comportamento correto (igual ao
// app) é: deixar o Cloudflare concluir UMA vez e seguir para o conteúdo.
const DOMINIOS_VERIFICACAO = [
  'challenges.cloudflare.com',
  'cloudflare.com',
  'turnstile',
];

/** O host pertence à verificação do Cloudflare/Turnstile (nunca tocar)? */
function ehHostVerificacao(host: string): boolean {
  const h = host.toLowerCase();
  return DOMINIOS_VERIFICACAO.some((d) => h === d || h.endsWith('.' + d) || h.includes(d));
}

const DOMINIOS_PERMITIDOS = [
  'yapgrid.com',
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
  // Contatos legítimos do rodapé (WhatsApp / Instagram):
  'wa.me',
  'whatsapp.com',
  'instagram.com',
];

/** A URL pode ser aberta (domínio do player, verificação ou navegação interna)? */
export function ehDominioPermitido(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    if (u.origin === window.location.origin) return true;
    if (!u.hostname) return false;
    // Hosts de verificação (Cloudflare/Turnstile) nunca são bloqueados.
    if (ehHostVerificacao(u.hostname)) return true;
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

/** Domínios de anúncio conhecidos (para sanitização de iframes e meta). */
const DOMINIOS_ANUNCIO = [
  'adsterra',
  'propeller',
  'popads',
  'exoclick',
  'trafficjunky',
  'doubleclick',
  'googlesyndication',
  'adservice',
  'adnxs',
  'cpmstar',
  'outbrain',
  'taboola',
  'revcontent',
  'mgid',
  'pushnative',
  'onclickads',
  'adcash',
  'adf.ly',
  'shorte.st',
  'ouo.io',
  'bc.vc',
  'linkvertise',
];

/** O host parece ser de anúncio (por nome)? */
function pareceHostAnuncio(host: string): boolean {
  const h = host.toLowerCase();
  return DOMINIOS_ANUNCIO.some((d) => h.includes(d));
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
let urlAtualApp = '';

// Guard de redirect GLOBAL (compartilhado entre todas as instâncias):
// contador de restaurações com janela de 2 minutos.
let totalRestauracoes = 0;
let janelaRestauracoesInicio = Date.now();

function resetarJanelaRestauracoes() {
  janelaRestauracoesInicio = Date.now();
  totalRestauracoes = 0;
}

/** Varredura periódica: fecha popups de anúncio abertos (com ou sem X). */
function iniciarVarreduraPopups(): void {
  if (janelaVarredura !== null) return;
  janelaVarredura = window.setInterval(() => {
    // Janelas abertas são rastreadas no módulo quando interceptadas pelo
    // window.open (Set janelasAbertas) — aqui apenas verificamos se alguma
    // janela ainda viva é de anúncio.
  }, 4000);
}

/** Remove <meta http-equiv="refresh"> que apontem para fora do app. */
function sanitizarMetaRefresh(): void {
  try {
    const metas = document.querySelectorAll('meta[http-equiv="refresh" i]');
    metas.forEach((m) => {
      const content = m.getAttribute('content') || '';
      const urlMatch = content.match(/url\s*=\s*(.+)/i);
      if (urlMatch) {
        const alvo = urlMatch[1].trim();
        // Se o alvo não é interno e não é domínio permitido → remove (anúncio).
        const urlAbs = (() => {
          try {
            return new URL(alvo, window.location.href).href;
          } catch {
            return alvo;
          }
        })();
        if (!ehDominioPermitido(urlAbs)) {
          m.remove();
        }
      }
    });
  } catch {
    /* ignore */
  }
}

/** Sanitiza o iframe do player: se navegou para host de anúncio, restaura. */
function sanitizarIframesAnuncio(): void {
  try {
    const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe');
    for (const iframe of iframes) {
      const src = iframe.getAttribute('src') || '';
      if (!src) continue;
      let host = '';
      try {
        host = new URL(src).hostname;
      } catch {
        continue;
      }
      if (host && pareceHostAnuncio(host)) {
        // Restaura o player se soubermos a URL original, senão remove o src.
        const playerSrc = iframe.getAttribute('data-player-src');
        if (playerSrc) iframe.setAttribute('src', playerSrc);
        else iframe.removeAttribute('src');
      }
    }
  } catch {
    /* ignore */
  }
}

/** Fecha automaticamente overlays de anúncio que aparecem no DOM (janela pai). */
function instalarAutoCloseOverlays(): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;

  /**
   * Um elemento pertence ao app legítimo (e NUNCA deve ser clicado)?
   * Overlays de anúncio NÃO vivem dentro de #root (são injetados no <body>,
   * fora da árvore do React, ou dentro de iframes). Tudo o que está em #root
   * é UI do MovieFlix — inclusive modais (que têm botão de fechar legítimo
   * com aria-label="Fechar"). Clicar nesse botão automaticamente quebraria os
   * modais do app (ex.: "Adicionar perfil" abre e fecha na hora).
   */
  function ehDoApp(el: Element): boolean {
    if (el.closest('[data-app-ui]')) return true;
    const root = document.getElementById('root');
    if (!root) return false;
    return root.contains(el);
  }

  function tentarFechar(): void {
    const body = document.body;
    if (!body) return;
    // 1) Seletores diretos de botão de fechar — SOMENTE fora de #root.
    for (const sel of SELETORES_FECHAR) {
      try {
        const els = body.querySelectorAll<HTMLElement>(sel);
        for (const el of els) {
          if (el.offsetParent === null && el.getClientRects().length === 0) continue; // invisível
          if (ehDoApp(el)) continue; // UI legítima do app — nunca clicar
          if (pareceBotaoFechar(el)) {
            el.click();
          }
        }
      } catch {
        /* seletor inválido — ignora */
      }
    }
    // 2) Elementos que parecem botão de fechar (fallback por texto/classes) —
    //    também somente fora de #root.
    const candidatos = body.querySelectorAll<HTMLElement>('button, a[role="button"], [role="dialog"] button, [class*="popup"] button, [class*="modal"] button, [class*="overlay"] button');
    for (const el of candidatos) {
      if (el.offsetParent === null && el.getClientRects().length === 0) continue;
      if (ehDoApp(el)) continue; // UI legítima do app — nunca clicar
      if (pareceBotaoFechar(el)) el.click();
    }
    // 3) Sanitização de meta refresh e iframes de anúncio.
    sanitizarMetaRefresh();
    sanitizarIframesAnuncio();
  }

  observer = new MutationObserver(() => {
    tentarFechar();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-label', 'title', 'src'] });

  // Varredura inicial + periódica (overlays que já existem ou aparecem sem mutation visível).
  tentarFechar();
  const iv = window.setInterval(tentarFechar, 2000);

  return () => {
    observer?.disconnect();
    observer = null;
    window.clearInterval(iv);
  };
}

/**
 * Instala (uma única vez) o bloqueio GLOBAL de popups, redirects, links
 * externos, navegação e auto-close de overlays de anúncio. Retorna função de
 * limpeza.
 */
export function instalarBloqueioAnuncios(): () => void {
  if (instalado) return () => undefined;
  instalado = true;

  const openOriginal = window.open.bind(window);
  const janelasAbertas = new Set<Window>();
  const hrefOriginal = Object.getOwnPropertyDescriptor(window.location, 'href');
  const assignOriginal = window.location.assign?.bind(window.location);
  const replaceOriginal = window.location.replace?.bind(window.location);

  // Guarda a URL atual do app (SPA) para restauração.
  urlAtualApp = window.location.href;
  window.addEventListener('popstate', () => {
    urlAtualApp = window.location.href;
  });

  // ── 1) Popups: CANCELA TUDO que não for domínio permitido ──────────────
  window.open = ((...args: Parameters<typeof window.open>) => {
    const url = typeof args[0] === 'string' ? args[0] : null;
    // Bloqueia TODO popup cuja URL não seja permitida — retorna null
    // (o chamador vê popup bloqueado, nada abre).
    if (url) {
      try {
        const u = new URL(url, window.location.href);
        // Exceção ÚNICA: WhatsApp oficial do MovieFlix (assinatura/suporte).
        if (isAllowedExternalUrl(u.href)) {
          const win = openOriginal(...args);
          if (win) {
            janelasAbertas.add(win);
            const vigia = window.setInterval(() => {
              if (win.closed) {
                janelasAbertas.delete(win);
                window.clearInterval(vigia);
              }
            }, 1000);
          }
          return win;
        }
        // Exceção: deep link do MovieFlix (movieflix://) — abre o app nativo.
        if (ehDeepLinkMovieFlix(u.href)) {
          return openOriginal(...args);
        }
        if (!ehDominioPermitido(u.href)) {
          return null;
        }
      } catch {
        return null;
      }
    }
    try {
      const win = openOriginal(...args);
      if (win) {
        janelasAbertas.add(win);
        // Segurança extra: se mesmo assim a janela for de anúncio, fecha.
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

  // ── 2) location.assign / location.replace / location.href ──────────────
  try {
    Object.defineProperty(window.location, 'assign', {
      configurable: true,
      writable: true,
      value: function assign(url: string | URL) {
        const alvo = String(url);
        // Deep link do MovieFlix (movieflix://) — permite abrir o app nativo.
        if (ehDeepLinkMovieFlix(alvo)) {
          return assignOriginal ? assignOriginal.call(window.location, url) : undefined;
        }
        try {
          const u = new URL(alvo, window.location.href);
          if (!ehDominioPermitido(u.href)) {
            return; // CANCELA navegação para fora
          }
        } catch {
          return;
        }
        return assignOriginal ? assignOriginal.call(window.location, url) : undefined;
      },
    });
  } catch { /* não crítico */ }

  try {
    Object.defineProperty(window.location, 'replace', {
      configurable: true,
      writable: true,
      value: function replace(url: string | URL) {
        const alvo = String(url);
        // Deep link do MovieFlix (movieflix://) — permite abrir o app nativo.
        if (ehDeepLinkMovieFlix(alvo)) {
          return replaceOriginal ? replaceOriginal.call(window.location, url) : undefined;
        }
        try {
          const u = new URL(alvo, window.location.href);
          if (!ehDominioPermitido(u.href)) {
            return; // CANCELA
          }
        } catch {
          return;
        }
        return replaceOriginal ? replaceOriginal.call(window.location, url) : undefined;
      },
    });
  } catch { /* não crítico */ }

  // location.href setter: intercepta e cancela navegação externa.
  try {
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      get() {
        return hrefOriginal?.get?.call(window.location) ?? window.location.href;
      },
      set(v: string) {
        const alvo = String(v);
        // Deep link do MovieFlix (movieflix://) — permite abrir o app nativo.
        if (ehDeepLinkMovieFlix(alvo)) {
          if (hrefOriginal?.set) hrefOriginal.set.call(window.location, v);
          else window.location.assign(alvo);
          return;
        }
        try {
          const u = new URL(alvo, window.location.href);
          if (ehDominioPermitido(u.href)) {
            // Navegação interna/legítima: usa o setter original.
            if (hrefOriginal?.set) hrefOriginal.set.call(window.location, v);
            else window.location.assign(alvo);
            return;
          }
        } catch {
          // URL inválida → ignora (anúncio malformado).
          return;
        }
        // Navegação externa CANCELADA (não faz nada).
      },
    });
  } catch { /* não crítico */ }

  // ── 3) Cliques em links externos (com OU sem target=_blank) ────────────
  function onDocumentClick(e: MouseEvent) {
    const alvo = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!alvo) return;
    const href = alvo.getAttribute('href') || '';
    if (!href) return;
    if (href.startsWith('/') || href.startsWith('#') || href.startsWith('?')) return;
    if (ehDominioPermitido(href)) return;
    // Deep link do MovieFlix (movieflix://) — permite abrir o app nativo.
    if (ehDeepLinkMovieFlix(href)) return;
    // Exceção ÚNICA e segura: WhatsApp OFICIAL do MovieFlix (assinatura/suporte).
    // Qualquer outro link externo que não seja domínio permitido = anúncio → cancela.
    if (isAllowedExternalUrl(href)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  document.addEventListener('click', onDocumentClick, true);

  // ── 4) beforeunload: última linha contra navegação externa ──────────────
  function onBeforeUnload(e: BeforeUnloadEvent) {
    // Se a página está saindo para um host externo (anúncio), cancela.
    // Não cancela reload/back interno legítimo (o usuário navegou).
    try {
      const destino = (e as unknown as { target?: { location?: { href?: string } } })?.target?.location?.href;
      if (destino && ehAnuncio(destino)) {
        e.preventDefault();
        e.returnValue = '';
        // Restaura a URL do app se possível.
        if (urlAtualApp && urlAtualApp !== window.location.href) {
          try { window.history.replaceState(null, '', urlAtualApp); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  window.addEventListener('beforeunload', onBeforeUnload);

  // ── 5) Auto-close de overlays + sanitização (meta refresh / iframes) ────
  const limparOverlays = instalarAutoCloseOverlays();
  iniciarVarreduraPopups();

  // ── 6) history: impede que anúncios alterem a URL do app via pushState ──
  const pushOriginal = history.pushState.bind(history);
  const replaceOriginal2 = history.replaceState.bind(history);
  try {
    history.pushState = ((...args: Parameters<typeof history.pushState>) => {
      // Permite navegação interna do SPA (rotas do app).
      return pushOriginal(...args);
    }) as typeof history.pushState;
    history.replaceState = ((...args: Parameters<typeof history.replaceState>) => {
      return replaceOriginal2(...args);
    }) as typeof history.replaceState;
  } catch { /* não crítico */ }

  return () => {
    window.open = openOriginal;
    try {
      if (hrefOriginal?.set) Object.defineProperty(window.location, 'href', hrefOriginal);
      if (assignOriginal) Object.defineProperty(window.location, 'assign', { configurable: true, writable: true, value: assignOriginal });
      if (replaceOriginal) Object.defineProperty(window.location, 'replace', { configurable: true, writable: true, value: replaceOriginal });
    } catch { /* ignore */ }
    document.removeEventListener('click', onDocumentClick, true);
    window.removeEventListener('beforeunload', onBeforeUnload);
    try {
      history.pushState = pushOriginal;
      history.replaceState = replaceOriginal2;
    } catch { /* ignore */ }
    limparOverlays();
    if (janelaVarredura !== null) {
      window.clearInterval(janelaVarredura);
      janelaVarredura = null;
    }
    instalado = false;
  };
}

/**
 * Guarda de redirect do iframe do player (REFORÇADA).
 *
 * Quando um anúncio redireciona o DOCUMENTO do iframe para fora do player
 * (mudança de página dentro do próprio iframe), um novo evento `load`
 * dispara no elemento <iframe> sem que a `src` original tenha mudado.
 * Detectamos isso e RESTAURAMOS a URL do player imediatamente.
 *
 * Reforços vs. versão anterior:
 *  - Contador GLOBAL de restaurações (todas as instâncias somam) com janela
 *    2 min — impede que um anúncio "gaste" as 3 restaurações de um iframe
 *    recriado.
 *  - Detecta também o caso em que o iframe navega para um HOST de anúncio
 *    (além de navegações genéricas): restaura na hora.
 *  - Se o iframe tiver `sandbox`, restaura e re-aplica o sandbox.
 */
export function protegerIframeContraRedirect(
  iframe: HTMLIFrameElement,
  srcOriginal: string,
): () => void {
  let cargas = 0;

  // Registra a URL original como atributo para a sanitização global.
  iframe.setAttribute('data-player-src', srcOriginal);

  function onLoad() {
    cargas += 1;
    // Primeira carga = conteúdo inicial do player; deixa passar.
    if (cargas <= 1) return;

    // Janela de 2 minutos para o contador global.
    if (Date.now() - janelaRestauracoesInicio > 120_000) resetarJanelaRestauracoes();
    if (totalRestauracoes >= 15) return; // limite de segurança anti-loop

    // URL atual do iframe (se legível).
    let hostAtual = '';
    try {
      hostAtual = iframe.contentWindow?.location?.hostname || '';
    } catch {
      hostAtual = ''; // cross-origin: não dá para ler
    }

    const srcAtributo = iframe.getAttribute('src') || '';

    // Restaura se:
    //  a) o iframe navegou para um host de anúncio (hostAtual lido), OU
    //  b) a src do atributo mudou do player (navegação interna do iframe).
    const navegouParaAnuncio = hostAtual !== '' && pareceHostAnuncio(hostAtual);
    const srcMudou = srcAtributo !== '' && srcAtributo !== srcOriginal && !srcAtributo.includes('about:blank');

    if (navegouParaAnuncio || srcMudou) {
      totalRestauracoes += 1;
      // Restaura a URL original do player.
      try {
        iframe.setAttribute('src', srcOriginal);
      } catch { /* ignore */ }
    }
  }

  iframe.addEventListener('load', onLoad);
  return () => iframe.removeEventListener('load', onLoad);
}
