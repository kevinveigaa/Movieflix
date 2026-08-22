/**
 * Configuração central das fontes de reprodução do MovieFlix.
 * ATUALIZADO: remove domínios mortos, adiciona fallback automático e fontes estáveis.
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

// Domínios que bloqueiam iframe (X-Frame-Options / CSP)
const HOSTS_QUE_BLOQUEIAM_IFRAME = [
  'megaembedapi.site',
  'vsembed.ru',        // ← DOMÍNIO MORTO (ERR_NAME_NOT_RESOLVED)
  'vsembed.net',       // ← DOMÍNIO MORTO
  'embed.warezcdn.link', // ← instável, frequentemente bloqueia
];

// Domínios que permitem iframe e estão funcionando
const HOSTS_QUE_PERMITEM_IFRAME = [
  'drive.google.com',
  'mediadelivery.net',
  'bunnycdn',
  'b-cdn.net',
  'vdohide',
  'vidsrc.cc',
  'vidsrc.xyz',
  'vidsrc.to',
  'vidsrc.me',
  'vidsrc.net',
  'vidsrc.in',
  'vidsrc.pm',
  'vidsrc.icu',
  'multiembed.mov',
  'multiembed.xyz',
  'embed.su',
  'player.autoembed.cc',
  '2embed.cc',
  '2embed.ru',
  'www.2embed.cc',
  'fmovies.ps',
  'fmoviesz.to',
];

// Domínios mortos ou fora do ar — usados para detectar URLs cadastradas inválidas
const DOMINIOS_MORTOS = [
  'vsembed.ru',
  'vsembed.net',
  'vsembed.com',
  'vsmovies.net',
  'superflixapi.net',
  'streamtape.com',
  'mixdrop.co',
  'uptostream.com',
  'fembed.com',
  'feurl.com',
  'asianload.io',
  'gogoanime',
  'animefire.net',
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
  return true; // por padrão, tenta — o PlayerPage cuida do fallback
}

/** Detecta se uma URL cadastrada aponta para domínio morto. */
export function urlCadastradaEhMorta(url: string): boolean {
  const host = hostDaUrl(url);
  if (!host) return false;
  return DOMINIOS_MORTOS.some((d) => host.includes(d));
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
    build: ({ videoUrl }) => {
      if (!videoUrl) return null;
      // Se a URL cadastrada for de domínio morto, retorna null para pular
      if (urlCadastradaEhMorta(String(videoUrl))) return null;
      return String(videoUrl);
    },
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
  {
    id: 'multiembed',
    name: 'MultiEmbed',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      if (tmdbId) return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&${tipo}=1`;
      if (imdbId) return `https://multiembed.mov/?video_id=${imdbId}&imdb=1&${tipo}=1`;
      return null;
    },
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    enabled: true,
    embeddable: true,
    build: ({ tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      if (!tmdbId) return null;
      return `https://player.autoembed.cc/embed/${tipo}/${tmdbId}?server=1`;
    },
  },
  {
    id: '2embed',
    name: '2Embed',
    enabled: true,
    embeddable: true,
    build: ({ imdbId, tmdbId, mediaType }) => {
      const tipo = tipoVidsrc(mediaType);
      if (tmdbId) return `https://www.2embed.cc/embed/${tipo}/${tmdbId}`;
      if (imdbId) return `https://www.2embed.cc/embed/${tipo}/imdb?id=${imdbId}`;
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
