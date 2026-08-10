import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { watchHistoryColumns } from '@/lib/watchHistoryColumns';
import type { MediaType, WatchHistoryRow } from '@/types';

const KEY = 'watch_history';

/** Chave da query: o histórico é por perfil (quando existe perfil ativo). */
function historyKey(userId?: string, profileId?: string) {
  return [KEY, userId, profileId ?? 'default'];
}

export function useWatchHistory() {
  const { user, activeViewerProfile } = useAuth();
  const profileId = activeViewerProfile?.id;
  return useQuery<WatchHistoryRow[]>({
    queryKey: historyKey(user?.id, profileId),
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const cols = await watchHistoryColumns();

      let query = supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user.id);

      // Com a coluna de perfil: filtra pelo perfil ativo (ou registros antigos
      // sem perfil quando nenhum está selecionado).
      if (cols.viewerProfileId) {
        if (profileId) query = query.eq('viewer_profile_id', profileId);
        else query = query.is('viewer_profile_id', null);
      }

      query = query.order('updated_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data as WatchHistoryRow[]) ?? [];
    },
  });
}

export interface UpsertHistoryArgs {
  /** Título do catálogo (movies.id). Usado em primeiro lugar para o retomar. */
  movieId?: string;
  /** ID do TMDb — fallback quando não há movieId (busca/player externo). */
  tmdbId?: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  positionSeconds: number;
  durationSeconds: number;
}

/** Busca o registro de reprodução de um título do catálogo (para retomar). */
export async function fetchHistoryForMovie(
  userId: string,
  profileId: string | null,
  movieId: string,
): Promise<WatchHistoryRow | null> {
  const cols = await watchHistoryColumns();

  let query = supabase.from('watch_history').select('*').eq('user_id', userId);

  if (cols.movieId && movieId) query = query.eq('movie_id', movieId);

  if (cols.viewerProfileId) {
    if (profileId) query = query.eq('viewer_profile_id', profileId);
    else query = query.is('viewer_profile_id', null);
  }

  query = query.order('updated_at', { ascending: false }).limit(1);

  const { data } = await query.maybeSingle();
  return (data as WatchHistoryRow | null) ?? null;
}

export function useUpsertHistory() {
  const { user, activeViewerProfile } = useAuth();
  const profileId = activeViewerProfile?.id;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: UpsertHistoryArgs) => {
      if (!user) return;
      const cols = await watchHistoryColumns();

      let find = supabase.from('watch_history').select('id').eq('user_id', user.id);

      if (cols.movieId && args.movieId) {
        find = find.eq('movie_id', args.movieId);
      } else if (args.tmdbId) {
        find = find.eq('tmdb_id', args.tmdbId).eq('media_type', args.mediaType);
      } else {
        return;
      }

      if (cols.viewerProfileId) {
        if (profileId) find = find.eq('viewer_profile_id', profileId);
        else find = find.is('viewer_profile_id', null);
      }

      const { data: existing } = await find.maybeSingle();

      const patch = {
        position_seconds: args.positionSeconds,
        duration_seconds: args.durationSeconds,
        title: args.title,
        poster_path: args.posterPath ?? null,
        backdrop_path: args.backdropPath ?? null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from('watch_history').update(patch).eq('id', existing.id);
      } else {
        const insert: Record<string, unknown> = {
          user_id: user.id,
          tmdb_id: args.tmdbId ?? null,
          media_type: args.mediaType,
          title: args.title,
          poster_path: args.posterPath ?? null,
          backdrop_path: args.backdropPath ?? null,
          position_seconds: args.positionSeconds,
          duration_seconds: args.durationSeconds,
        };
        if (cols.movieId && args.movieId) insert.movie_id = args.movieId;
        if (cols.viewerProfileId) insert.viewer_profile_id = profileId;
        await supabase.from('watch_history').insert(insert);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRemoveHistory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) return;
      await supabase.from('watch_history').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
