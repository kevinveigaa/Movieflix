import { supabase } from '@/lib/supabase';

interface FavoritesColumns {
  /** A tabela tem a coluna viewer_profile_id? (migration 20260823120000) */
  viewerProfileId: boolean;
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
 * Detecta (uma única vez, com cache) se o banco já foi migrado com a coluna
 * de perfil dos favoritos. Permite que o app funcione antes e depois de rodar
 * `supabase/migrations/20260823120000_favorites_profile_columns.sql`.
 */
export async function favoritesColumns(): Promise<FavoritesColumns> {
  if (cached) return cached;

  const probe = async (col: string): Promise<boolean> => {
    const { error } = await supabase.from('favorites').select(col).limit(0);
    return !isMissingColumn(error);
  };

  cached = {
    viewerProfileId: await probe('viewer_profile_id'),
  };
  return cached;
}