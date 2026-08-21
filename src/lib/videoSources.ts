/**
 * Configuração central das fontes de reprodução do MovieFlix.
 *
 * Para trocar/adicionar uma fonte no futuro, mexa SOMENTE neste arquivo.
 *
 * Campos:
 *  - name:      nome exibido ao usuário.
 *  - build:     recebe os identificadores do título e devolve a URL do player
 *               (ou null quando aquele título não tem o id necessário).
 *  - enabled:   liga/desliga a fonte sem apagar o código.
 *  - embeddable: false quando o provedor envia X-Frame-Options / CSP
 *               frame-ancestors e por isso NÃO pode ser exibido dentro de um
 *               iframe. Nesses casos o MovieFlix mostra o aviso e o botão de
 *               abrir em nova aba, em vez de uma tela branca.
 */

export type VideoSourceIds = {
  /** URL cadastrada no painel admin para o título/episódio. */
  videoUrl?: string | null;
  imdbId?: string | null;
  tmdbId?: string | number | null;
};

export type VideoSource = {
  id: string;
  name: string;
  enabled: boolean;
  embeddable: boolean;
  build: (ids: VideoSourceIds) => string | null;
};

/** Provedores conhecidos que BLOQUEIAM iframe (X-Frame-Options / CSP). */
const HOSTS_QUE_BLOQUEIAM_IFRAME = ['megaembedapi.site'];

/** Provedores conhecidos que permitem iframe. */
const HOSTS_QUE_PERMITEM_IFRAME = [
  'mediadelivery.net',
  'bunnycdn',
  'b-cdn.net',
  'vdohide',
];

export function hostDaUrl(url: string): string {
  try {
    return new URL(url, typeof window !== 'undefined' ? window.location.href : 'https://localhost').hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Heurística: essa URL pode ser exibida dentro de um iframe? */
export function podeSerIncorporada(url: string): boolean {
  const host = hostDaUrl(url);
  if (!host) return true;
  if (HOSTS_QUE_BLOQUEIAM_IFRAME.some((h) => host.includes(h))) return false;
  if (HOSTS_QUE_PERMITEM_IFRAME.some((h) => host.includes(h))) return true;
  return true; // desconhecido: tenta o iframe e usa o fallback se falhar
}

export const videoSources: VideoSource[] = [
  {
    id: 'cadastrada',
    name: 'Fonte cadastrada',
    enabled: true,
    embeddable: true, // verificado em tempo de execução por podeSerIncorporada()
    build: ({ videoUrl }) => (videoUrl ? String(videoUrl) : null),
  },
  // Exemplo de fonte extra (desligada). Habilite apenas fontes autorizadas:
  // {
  //   id: 'minha-fonte',
  //   name: 'Minha Fonte',
  //   enabled: false,
  //   embeddable: true,
  //   build: ({ imdbId }) => (imdbId ? `https://exemplo.com/embed/${imdbId}` : null),
  // },
];

export type FonteResolvida = { id: string; name: string; url: string; embeddable: boolean };

/** Lista final de fontes válidas para um título, na ordem de tentativa. */
export function resolverFontes(ids: VideoSourceIds): FonteResolvida[] {
  const out: FonteResolvida[] = [];
  for (const src of videoSources) {
    if (!src.enabled) continue;
    const url = src.build(ids);
    if (!url) continue;
    if (out.some((f) => f.url === url)) continue;
    out.push({
      id: src.id,
      name: src.name,
      url,
      embeddable: src.embeddable && podeSerIncorporada(url),
    });
  }
  return out;
}
