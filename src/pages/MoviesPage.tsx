import { CatalogPage } from '@/pages/CatalogPage';

/**
 * Página exclusiva de FILMES (/filmes).
 *
 * Reutiliza TODO o catálogo (busca, categorias, ordenação A–Z/Z–A/ano/nota,
 * contagem real, carregamento progressivo) já filtrado APENAS para filmes —
 * nunca mistura séries. O card abre somente /titulo/movie/:id.
 */
export function MoviesPage() {
  return <CatalogPage kind="filmes" />;
}
