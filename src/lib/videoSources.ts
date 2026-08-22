/**
 * Configuração central das fontes de reprodução do MovieFlix.
 */

export type VideoSourceIds = {
  videoUrl?: string | null;
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null; // 'movie' | 'tv' | 'series' | 'anime'
};

export type VideoSource = {
  id: string;
  name: string;
  enabled: boolean;
  embeddable: boolean;
  build: (ids: VideoSourceIds) => string | null;
};

const HOSTS_QUE_BLOQUEIAM_IFRAME = ['megaembedapi.site'];

const HOSTS_QUE_PERMITEM_IFRAME = [
  'drive.google.com',   // ← linha nova
  'mediadelivery.net',
  'bunnycdn',
  'b-cdn.net',
  'vdohide',
  'warezcdn.link',
  'embed.warezcdn.link',
  'vidsrc.cc',
  'vidsrc.xyz',
  'vidsrc.to',
  'vidsrc.me',
  'vidsrc.net',
];

export function hostDaUrl(url: string): string {
  try {
    return new URL(url, typeof window !== 'undefined' ? window.location.href : 'https://localhost').hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function podeSerIncorporada(url: string): boolean {
  const host = hostDaUrl(url);
  if (!host) return true;
  if (HOSTS_QUE_BLOQUEIAM_IFRAME.some((h) => host.includes(h))) return false;
  if (HOSTS_QUE_PERMITEM_IFRAME.some((h) => host.includes(h))) return true;
  return true;
}

function tipoVidsrc(mediaType?: string | null): 'movie' | 'tv' {
  if (mediaType === 'tv' || mediaType === 'series' || mediaType === 'anime') return 'tv';
  return 'movie';
}

export const videoSources: VideoSource[] = [
  {
    id: 'cadastrada',
    name: 'Fonte cadastrada',
    enabled: true,
    embeddable: true,
    build: ({ videoUrl }) => (videoUrl ? String(videoUrl) : null),
  },
  {
    // Fonte brasileira: costuma trazer o áudio DUBLADO em português por padrão.
    id: 'warezcdn',
    name: 'Dublado (PT-BR)',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, mediaType }) => {
      if (!imdbId) return null;
      const tipo = tipoVidsrc(mediaType) === 'tv' ? 'serie' : 'filme';
      return `https://embed.warezcdn.link/${tipo}/${imdbId}`;
    },
  },
  {
    id: 'vidsrc-cc',
    name: 'VidSrc PT',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      const id = imdbId || tmdbId;
      if (!id) return null;
      // ds_lang=pt força a interface/legendas em português e prioriza faixas PT.
      return `https://vidsrc.cc/v2/embed/${tipo}/${id}?autoPlay=true&ds_lang=pt`;
    },
  },
  {
    id: 'vidsrc-xyz',
    name: 'VidSrc',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      if (imdbId) return `https://vidsrc.xyz/embed/${tipo}/${imdbId}?ds_lang=pt`;
      if (tmdbId) return `https://vidsrc.xyz/embed/${tipo}?tmdb=${tmdbId}&ds_lang=pt`;
      return null;
    },
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc 2',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      if (imdbId) return `https://vidsrc.to/embed/${tipo}/${imdbId}?ds_lang=pt`;
      if (tmdbId) return `https://vidsrc.to/embed/${tipo}?tmdb=${tmdbId}&ds_lang=pt`;
      return null;
    },
  },
  {
    id: 'vidsrc-me',
    name: 'VidSrc 3',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      if (imdbId) return `https://vidsrc.me/embed/${tipo}?imdb=${imdbId}`;
      if (tmdbId) return `https://vidsrc.me/embed/${tipo}?tmdb=${tmdbId}`;
      return null;
    },
  },
];

export type FonteResolvida = { id: string; name: string; url: string; embeddable: boolean };

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
