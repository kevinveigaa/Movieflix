/**
 * Fontes de vídeo do MovieFlix — vidsrc via proxy interno
 */

export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

export function getVidsrcUrl(ids: VideoIds): string | null {
  const tipo = ids.mediaType === 'tv' || ids.mediaType === 'series' || ids.mediaType === 'anime' ? 'tv' : 'movie';
  const id = ids.imdbId || ids.tmdbId;
  if (!id) return null;
  return `https://vidsrc.cc/v2/embed/${tipo}/${id}?autoPlay=true`;
}

/** URL do proxy interno (mesmo domínio, sem bloqueio de iframe) */
export function getProxyUrl(vidsrcUrl: string): string {
  return `/api/player?url=${encodeURIComponent(vidsrcUrl)}`;
}
