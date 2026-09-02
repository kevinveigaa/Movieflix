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
 */
export function abrirAppLink(deepLink: string): void {
  try {
    // Tenta abrir o app via deep link (movieflix://...). Se o app estiver
    // instalado, ele assume e o site sai de foco. Se não, o navegador pode
    // mostrar erro — então agendamos o fallback de download.
    const win = window.open(deepLink, '_self');
    if (win) {
      window.setTimeout(() => {
        // Ainda estamos na página (o app não assumiu) → vai para o download.
        if (document.visibilityState === 'visible') {
          window.location.href = DOWNLOAD_PAGE_URL;
        }
      }, 1200);
      return;
    }
  } catch {
    // window.open falhou (popup bloqueado) — cai direto no fallback.
  }
  // Fallback: página oficial de download.
  window.location.href = DOWNLOAD_PAGE_URL;
}