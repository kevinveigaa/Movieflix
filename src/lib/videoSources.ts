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
  'mediadelivery.net',
  'bunnycdn',
  'b-cdn.net',
  'vdohide',
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
    id: 'vidsrc-xyz',
    name: 'VidSrc',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      if (imdbId) return `https://vidsrc.xyz/embed/${tipo}/${imdbId}`;
      if (tmdbId) return `https://vidsrc.xyz/embed/${tipo}?tmdb=${tmdbId}`;
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
      if (imdbId) return `https://vidsrc.to/embed/${tipo}/${imdbId}`;
      if (tmdbId) return `https://vidsrc.to/embed/${tipo}?tmdb=${tmdbId}`;
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
Arquivo 2: src/pages/PlayerPage.tsx
Apenas uma linha muda. Procure esta linha (está por volta da linha 47):

() => resolverFontes({ videoUrl, imdbId: movie?.imdb_id, tmdbId: movie?.tmdb_id }),
[videoUrl, movie?.imdb_id, movie?.tmdb_id]
Substitua por:

() => resolverFontes({ videoUrl, imdbId: movie?.imdb_id, tmdbId: movie?.tmdb_id, mediaType: movie?.type || movie?.media_type }),
[videoUrl, movie?.imdb_id, movie?.tmdb_id, movie?.type, movie?.media_type]
Como aplicar pelo GitHub Web (mais fácil)
Acesse https://github.com/kevinveigaa/Movieflix/blob/main/src/lib/videoSources.ts
Clique no ícone de lápis (Edit)
Seleciona tudo (Ctrl+A) e cola o novo conteúdo
Clique em Commit changes
Repita para o PlayerPage.tsx com apenas a pequena troca de linha
Depois que commitar, o Render vai fazer o deploy automático. Os filmes que tiverem imdb_id ou tmdb_id cadastrados no banco vão aparecer com as fontes VidSrc, VidSrc 2 e VidSrc 3 como opção de fallback.



