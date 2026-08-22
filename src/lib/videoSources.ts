export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Fonte de reprodução para um título do catálogo.
 *
 * Apenas UMA fonte é usada (fonte 1): o provedor VidZee, que foi validado
 * e funciona (filmes e séries reproduzem de verdade em iframe, com
 * `Content-Security-Policy: frame-ancestors *`).
 *
 * Os demais provedores (vidsrc.to, vidsrc.me, 2embed.cc etc.) foram
 * testados e descartados — falhavam na prática (tela preta, HTTP 522/403,
 * challenge Cloudflare, servidor de seleção etc.). Por isso a cascata de
 * fallback foi REMOVIDA: o player usa somente esta fonte.
 */
export function getVideoSources(ids: VideoIds): string[] {
  const tipo =
    ids.mediaType === 'tv' || ids.mediaType === 'series' || ids.mediaType === 'anime'
      ? 'tv'
      : 'movie';

  const id = ids.imdbId || ids.tmdbId;
  const sources: string[] = [];

  if (id) {
    if (ids.tmdbId && tipo === 'movie') {
      // Fonte 1 (única): VidZee — reproduz filmes de verdade.
      sources.push(`https://player.vidzee.wtf/embed/movie/${ids.tmdbId}`);
    } else if (ids.tmdbId && tipo === 'tv') {
      // Séries: o PlayerPage monta a URL com temporada/episódio via getTvSource.
      sources.push(`https://player.vidzee.wtf/embed/tv/${ids.tmdbId}/1/1`);
    } else if (typeof id === 'string' && id.startsWith('tt')) {
      sources.push(`https://player.vidzee.wtf/embed/movie/${id}`);
    }
    // Nenhuma outra fonte/fallback — apenas a fonte 1.
  }

  return sources;
}

/**
 * Monta a URL do VidZee para um episódio específico de série.
 * Ex.: TMDB 1396 (Breaking Bad), temporada 1, episódio 1 →
 * https://player.vidzee.wtf/embed/tv/1396/1/1
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  return `https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`;
}

/**
 * Mantém compatibilidade com o resto do código que usa getVidsrcUrl:
 * devolve a fonte 1 (ou null se não houver IDs).
 */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}
