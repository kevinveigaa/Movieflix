/**
 * Fontes de reprodução do MovieFlix.
 * Reescrito do zero: fallback automático, domínios mortos ignorados.
 */

export type VideoIds = {
  videoUrl?: string | null;
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

export type Source = {
  id: string;
  name: string;
  url: string | null;
};

const DEAD_DOMAINS = [
  'vsembed.ru', 'vsembed.net', 'vsembed.com',
  'superflixapi', 'mixdrop', 'streamtape',
  'fembed', 'feurl', 'uptostream',
  'asianload', 'animefire',
];

function isDeadUrl(url: string): boolean {
  const u = url.toLowerCase();
  return DEAD_DOMAINS.some((d) => u.includes(d));
}

function mediaType(ids: VideoIds): 'movie' | 'tv' {
  const t = ids.mediaType;
  if (t === 'tv' || t === 'series' || t === 'anime') return 'tv';
  return 'movie';
}

export function getSources(ids: VideoIds): Source[] {
  const sources: Source[] = [];
  const tipo = mediaType(ids);

  // 1. Fonte cadastrada (se não for domínio morto)
  if (ids.videoUrl && !isDeadUrl(ids.videoUrl)) {
    sources.push({ id: 'cadastrada', name: 'Fonte cadastrada', url: ids.videoUrl });
  }

  // 2. WarezCDN (dublado PT-BR)
  if (ids.imdbId) {
    const t = tipo === 'tv' ? 'serie' : 'filme';
    sources.push({ id: 'warezcdn', name: 'Dublado (PT-BR)', url: `https://embed.warezcdn.link/${t}/${ids.imdbId}` });
  }

  // 3. VidSrc.cc
  const id = ids.imdbId || ids.tmdbId;
  if (id) {
    sources.push({ id: 'vidsrc-cc', name: 'VidSrc PT', url: `https://vidsrc.cc/v2/embed/${tipo}/${id}?autoPlay=true&ds_lang=pt` });
    sources.push({ id: 'vidsrc-xyz', name: 'VidSrc', url: `https://vidsrc.xyz/embed/${tipo}/${id}?ds_lang=pt` });
    sources.push({ id: 'vidsrc-to', name: 'VidSrc 2', url: `https://vidsrc.to/embed/${tipo}/${id}?ds_lang=pt` });
    sources.push({ id: 'vidsrc-me', name: 'VidSrc 3', url: `https://vidsrc.me/embed/${tipo}?imdb=${ids.imdbId || ids.tmdbId}` });
  }

  // 4. MultiEmbed
  if (ids.tmdbId) {
    sources.push({ id: 'multiembed', name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${ids.tmdbId}&tmdb=1&${tipo}=1` });
  }

  // 5. AutoEmbed
  if (ids.tmdbId) {
    sources.push({ id: 'autoembed', name: 'AutoEmbed', url: `https://player.autoembed.cc/embed/${tipo}/${ids.tmdbId}?server=1` });
  }

  // 6. 2Embed
  if (ids.tmdbId) {
    sources.push({ id: '2embed', name: '2Embed', url: `https://www.2embed.cc/embed/${tipo}/${ids.tmdbId}` });
  } else if (ids.imdbId) {
    sources.push({ id: '2embed', name: '2Embed', url: `https://www.2embed.cc/embed/${tipo}/imdb?id=${ids.imdbId}` });
  }

  // Remover duplicatas
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (!s.url) return false;
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}
