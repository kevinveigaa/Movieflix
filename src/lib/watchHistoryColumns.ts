import { supabase } from '@/lib/supabase';

interface WatchHistoryColumns {
  /** A tabela tem a coluna viewer_profile_id? (migration 20260810140000) */
  viewerProfileId: boolean;
  /** A tabela tem a coluna movie_id? (migration 20260810140000) */
  movieId: boolean;
}

let cached: WatchHistoryColumns | null = null;

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST204' ||
    /does not exist|Could not find the .* column/i.test(error.message ?? '')
  );
}

/**
 * Detecta (uma única vez, com cache) se o banco já foi migrado com as colunas
 * de perfil/título do histórico. Permite que o app funcione antes e depois de
 * rodar `supabase/migrations/20260810140000_watch_history_profile_columns.sql`.
 */
export async function watchHistoryColumns(): Promise<WatchHistoryColumns> {
  if (cached) return cached;

  const probe = async (col: string): Promise<boolean> => {
    const { error } = await supabase.from('watch_history').select(col).limit(0);
    return !isMissingColumn(error);
  };

  cached = {
    viewerProfileId: await probe('viewer_profile_id'),
    movieId: await probe('movie_id'),
  };
  return cached;
}
