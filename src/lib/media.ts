/**
 * Identificação de séries no catálogo.
 *
 * A tabela `movies` guarda filmes e séries juntos; o campo `type` (e a ausência
 * de `video_url` em animes) define o que é série. Centralizado aqui para que o
 * filtro "esconder séries", as abas e as páginas usem exatamente a mesma regra.
 */

const TIPOS_SERIE = ['series', 'serie', 'tv'];

/** É uma série (ou anime com temporadas/episódios, sem vídeo único)? */
export function ehSerie(
  movie: { type?: string | null; video_url?: string | null } | null | undefined,
): boolean {
  if (!movie) return false;
  const tipo = String(movie.type ?? '').toLowerCase();
  if (TIPOS_SERIE.includes(tipo)) return true;
  // Anime sem URL única é série (tem temporadas/episódios); com URL é filme.
  if (tipo === 'anime') return !movie.video_url;
  return false;
}

/** É um filme (o oposto de série)? */
export function ehFilme(
  movie: { type?: string | null; video_url?: string | null } | null | undefined,
): boolean {
  return !ehSerie(movie);
}
