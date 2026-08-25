import { CatalogPage } from '@/pages/CatalogPage';

/**
 * Página exclusiva de SÉRIES (/series).
 *
 * Reutiliza TODO o catálogo (busca, categorias, ordenação A–Z/Z–A/ano/nota,
 * contagem real, carregamento progressivo) já filtrado APENAS para séries —
 * nunca mistura filmes. O card abre somente /titulo/tv/:id.
 */
export function SeriesPage() {
  return <CatalogPage kind="series" />;
}
