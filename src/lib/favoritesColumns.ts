import { supabase } from '@/lib/supabase';

interface FavoritesColumns {
  /** A tabela tem a columna viewer_profile_id? (migration 20260823120000) */
  viewerProfileId: boolean;
  /** A tabela tem a columna movie_id? (migration 20260823130000) */
  movieId: boolean;
}

let cached: FavoritesColumns | null = null;

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST204' ||
    /does not exist|Could not find the .* column/i.test(error.message ?? '')
  );
}

/**
 * Detecta (uma única vez, com cache) se o banco já foi migrado com as colunas
 * de perfil/título dos favoritos. Permite que o app funcione antes e depois de
 * rodar `supabase/migrations/20260823120000_favorites_profile_columns.sql` e
 * `20260823130000_favorites_movie_id.sql`.
 */
export async function favoritesColumns(): Promise<FavoritesColumns> {
  if (cached) return cached;

  const probe = async (col: string): Promise<boolean> => {
    const { error } = await supabase.from('favorites').select(col).limit(0);
    return !isMissingColumn(error);
  };

  cached = {
    viewerProfileId: await probe('viewer_profile_id'),
    movieId: await probe('movie_id'),
  };
  return cached;
}