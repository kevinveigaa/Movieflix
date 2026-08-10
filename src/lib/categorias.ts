/**
 * Categorias do catálogo.
 *
 * Uma obra pode pertencer a várias categorias ao mesmo tempo: elas ficam
 * gravadas na coluna `category` separadas por vírgula (ex.: "Ação, Aventura").
 * Todo lugar do site que mostra categorias usa estes helpers, para que o filme
 * apareça em TODAS as categorias marcadas no painel admin.
 */

export const CATEGORIAS = [
  "Ação",
  "Aventura",
  "Ficção Científica",
  "Terror",
  "Comédia",
  "Drama",
  "Romance",
  "Suspense",
  "Fantasia",
  "Animação",
  "Anime",
  "Infantil",
  "Crime",
  "Mistério",
  "Guerra",
  "Faroeste",
  "História",
  "Música",
  "Família",
  "Cinema TV",
  "Novela",
  "Clássicos",
  "Nacional",
];

/** Ordem preferida na home — as demais entram depois, em ordem alfabética. */
export const ORDEM_CATEGORIAS = CATEGORIAS;

/** Remove acentos e caixa, para comparar "Ficção" com "ficcao". */
export function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Lista de categorias de uma obra (sempre pelo menos uma). */
export function categoriasDoFilme(movie: { category?: string | null } | null | undefined): string[] {
  const lista = String(movie?.category ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return lista.length ? Array.from(new Set(lista)) : ["Outros"];
}

/** A obra pertence à categoria informada? */
export function temCategoria(movie: { category?: string | null }, categoria: string): boolean {
  const alvo = normalizar(categoria);
  return categoriasDoFilme(movie).some((c) => normalizar(c) === alvo);
}

/**
 * Categorias que representam conteúdo infantil. O filtro "Infantil" agrega
 * todas elas (mais o tipo "kids"), para que filmes como Toy Story — que podem
 * estar marcados como "Animação" ou "Família" no painel admin — nunca sumam
 * da categoria infantil.
 */
export const CATEGORIAS_KIDS = ["Infantil", "Animação", "Família"];

/** A obra é conteúdo infantil? (categoria infantil/animada/familiar ou tipo "kids"). */
export function ehInfantil(
  movie: { category?: string | null; type?: string | null } | null | undefined,
): boolean {
  if (!movie) return false;
  if (String(movie.type ?? "").toLowerCase() === "kids") return true;
  return CATEGORIAS_KIDS.some((c) => temCategoria(movie, c));
}

/** O filtro de categoria representa a seção "Infantil"? (agrega as categorias kids). */
export function isCategoriaKids(categoria: string): boolean {
  return normalizar(categoria) === "infantil";
}

/** Ordenação usada na home e no menu. */
export function ordenarCategorias(nomes: string[]): string[] {
  return [...nomes].sort((a, b) => {
    const ia = ORDEM_CATEGORIAS.findIndex((c) => normalizar(c) === normalizar(a));
    const ib = ORDEM_CATEGORIAS.findIndex((c) => normalizar(c) === normalizar(b));
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    if (normalizar(a) === "outros") return 1;
    if (normalizar(b) === "outros") return -1;
    return a.localeCompare(b, "pt-BR");
  });
}
