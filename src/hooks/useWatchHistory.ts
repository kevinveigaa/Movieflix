import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { titleName } from '@/lib/tmdb';
import type { MediaType, TmdbTitle, WatchHistoryRow } from '@/types';

const KEY = 'watch_history';

export function useWatchHistory() {
  const { user } = useAuth();
  return useQuery<WatchHistoryRow[]>({
    queryKey: [KEY, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as WatchHistoryRow[]) ?? [];
    },
  });
}

export function useUpsertHistory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      title: TmdbTitle;
      positionSeconds: number;
      durationSeconds: number;
    }) => {
      if (!user) return;
      const type: MediaType = args.title.media_type === 'tv' || args.title.first_air_date || args.title.name ? 'tv' : 'movie';
      const { data: existing } = await supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('tmdb_id', args.title.id)
        .eq('media_type', type)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('watch_history')
          .update({
            position_seconds: args.positionSeconds,
            duration_seconds: args.durationSeconds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('watch_history').insert({
          user_id: user.id,
          tmdb_id: args.title.id,
          media_type: type,
          title: titleName(args.title),
          poster_url: args.title.poster_url,
          poster_path: args.title.poster_path,
          backdrop_path: args.title.backdrop_path,
          vote_average: args.title.vote_average,
          position_seconds: args.positionSeconds,
          duration_seconds: args.durationSeconds,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, user?.id] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, user?.id] }),
  });
}

