/**
 * Identificação de séries no catálogo.
 *
 * O catálogo (filmes/filmes.json + filmes/series.json, gerado por
 * gerar-catalogo.cjs) guarda filmes e séries juntos; o campo `type` define
 * o que é série. Centralizado aqui para que o filtro "esconder séries",
 * as abas e as páginas usem exatamente a mesma regra.
 */

const TIPOS_SERIE = ['series', 'serie', 'tv'];

/** É uma série? */
export function ehSerie(
  movie: { type?: string | null; video_url?: string | null } | null | undefined,
): boolean {
  if (!movie) return false;
  const tipo = String(movie.type ?? '').toLowerCase();
  return TIPOS_SERIE.includes(tipo);
}

/** É um filme (o oposto de série)? */
export function ehFilme(
  movie: { type?: string | null; video_url?: string | null } | null | undefined,
): boolean {
  return !ehSerie(movie);
}

/**
 * O título já foi lançado? Compara o ano cadastrado com o ano atual.
 * Títulos sem ano não são bloqueados (não dá para provar que são futuros).
 */
export function ehLancado(
  movie: { year?: string | number | null } | null | undefined,
): boolean {
  if (!movie?.year) return true;
  const ano = Number(movie.year);
  if (!Number.isFinite(ano)) return true;
  return ano <= new Date().getFullYear();
}

/**
 * O título pode ser assistido agora?
 * - Filmes precisam de video_url e já ter sido lançados.
 * - Séries/animes (com temporadas/episódios) valem mesmo sem video_url único,
 *   mas também precisam ter sido lançados.
 */
export function estaDisponivel(
  movie: {
    type?: string | null;
    video_url?: string | null;
    year?: string | number | null;
  } | null | undefined,
): boolean {
  if (!movie) return false;
  if (!ehLancado(movie)) return false;
  if (ehSerie(movie)) return true;
  return Boolean(movie.video_url);
}