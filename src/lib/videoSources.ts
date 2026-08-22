export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Gera a URL de reprodução para um título do catálogo.
 *
 * A fonte de verdade é o `video_url` cadastrado no banco (painel admin):
 * ele aponta para o domínio de embed que realmente funciona (ex.: vidsrc.to).
 * Só quando ele não existe é que tentamos montar uma URL a partir dos IDs
 * TMDB/IMDB — e nesse caso usamos vidsrc.to (o vidsrc.cc/v2 retorna 403
 * e não reproduz nada).
 */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const tipo = ids.mediaType === 'tv' || ids.mediaType === 'series' || ids.mediaType === 'anime' ? 'tv' : 'movie';
  const id = ids.imdbId || ids.tmdbId;
  if (!id) return null;
  return `https://vidsrc.to/embed/${tipo}/${id}`;
}
