/**
 * MovieFlix — Deep Link / "Abrir aplicativo".
 *
 * O SITE NÃO reproduz vídeo. Quando o usuário clica em "Assistir" no navegador,
 * o site mostra a tela "Assista pelo aplicativo" e, ao tocar em "ABRIR
 * APLICATIVO", tenta abrir o app nativo (Android/Capacitor) direto no conteúdo
 * escolhido via deep link. Se o app não estiver instalado, cai para a página
 * oficial de download.
 *
 * Regra de produto:
 *  - SITE → NÃO reproduz vídeo. Convite para abrir/baixar o app.
 *  - APP  → reproduz normalmente (o deep link preserva o título escolhido).
 *
 * Formato do deep link (bate com o intent-filter do AndroidManifest):
 *   movieflix://assistir/{id}?season={s}&ep={e}   (filme ou episódio de série)
 *   movieflix://titulo/{id}                        (página de detalhes)
 *
 * O MainActivity (Android) intercepta `movieflix://` e navega o WebView para a
 * rota correspondente do site (que roda dentro do app).
 */

import { DOWNLOAD_PAGE_URL } from '@/lib/appInfo';

/** Scheme registrado no app Android (bate com o AndroidManifest). */
export const DEEP_LINK_SCHEME = 'movieflix:';

/**
 * É um deep link do MovieFlix (scheme `movieflix:`)?
 * Usado pelo antiAds para PERMITIR a abertura do app nativo (única exceção de
 * navegação externa além do WhatsApp oficial). Qualquer outro scheme/domínio
 * continua bloqueado.
 */
export function ehDeepLinkMovieFlix(url: string): boolean {
  if (!url) return false;
  const u = String(url).trim();
  return u.startsWith('movieflix:') || u.startsWith('movieflix://');
}

/**
 * Monta o deep link para abrir o app direto num conteúdo.
 * - `assistir` : movieflix://assistir/{id}?season={s}&ep={e} (filme ou episódio)
 * - `titulo`   : movieflix://titulo/{id} (página de detalhes)
 */
export function montarDeepLink(opts: {
  id: string;
  season?: number | string | null;
  episode?: number | string | null;
  tipo?: 'assistir' | 'titulo';
}): string {
  const tipo = opts.tipo ?? 'assistir';
  const base = `${DEEP_LINK_SCHEME}/${tipo}/${encodeURIComponent(opts.id)}`;
  if (tipo === 'assistir' && opts.season != null && opts.episode != null) {
    return `${base}?season=${encodeURIComponent(String(opts.season))}&episode=${encodeURIComponent(String(opts.episode))}`;
  }
  return base;
}

/**
 * Tenta abrir o app via deep link. Se o app não estiver instalado (o navegador
 * não reconhece o scheme), cai para a página oficial de download. Não cria
 * loops de redirecionamento nem abre várias abas.
 *
 * MECANISMO CORRETO para custom scheme no Android: navegação DIRETA via
 * `location.href` (não `window.open`). O Chrome/WebView reconhece o scheme
 * `movieflix:` e entrega o intent ao app instalado; se não houver app, o
 * navegador mostra um erro e a página permanece — então o fallback de download
 * dispara. `window.open` com custom scheme é bloqueado/ignorado por muitos
 * navegadores, o que fazia o botão cair SEMPRE no download mesmo com o app
 * instalado.
 */
export function abrirAppLink(deepLink: string): void {
  try {
    // 1) Navegação direta para o scheme. Se o app estiver instalado, ele
    //    assume e o site sai de foco (visibilitychange → hidden).
    window.location.href = deepLink;

    // 2) Fallback controlado: se após um curto intervalo o site AINDA estiver
    //    visível (o app não assumiu), o scheme não foi reconhecido → app não
    //    instalado → vai para a página oficial de download.
    window.setTimeout(() => {
      try {
        if (document.visibilityState === 'visible') {
          window.location.href = DOWNLOAD_PAGE_URL;
        }
      } catch {
        /* ignora */
      }
    }, 1200);
  } catch {
    // Navegação falhou (ex.: scheme bloqueado) → fallback direto.
    window.location.href = DOWNLOAD_PAGE_URL;
  }
}