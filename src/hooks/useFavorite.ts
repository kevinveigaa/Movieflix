import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { img, titleName } from '@/lib/tmdb';
import type { MediaType, TmdbTitle } from '@/types';

const FAV_KEY = 'favorites';

export function useFavorites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [FAV_KEY, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useFavorite(tmdbId: number, mediaType: MediaType) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const favs = useFavorites();
  const row = favs.data?.find((f) => f.tmdb_id === tmdbId && f.media_type === mediaType);
  const isFavorite = !!row;

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Faça login para favoritar.');
      if (row) {
        await supabase.from('favorites').delete().eq('id', row.id);
      } else {
        await supabase.from('favorites').insert({
          user_id: user.id,
          tmdb_id: tmdbId,
          media_type: mediaType,
          title: "",
          poster_path: "",
          backdrop_path: "",
          vote_average: 0,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FAV_KEY, user?.id] }),
  });

  return { isFavorite, toggle: toggle.mutate, loading: toggle.isPending };
}

export function useToggleFavoriteByTitle() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: TmdbTitle) => {
      if (!user) throw new Error('Faça login para favoritar.');
      const type: MediaType = t.media_type === 'tv' || t.first_air_date || t.name ? 'tv' : 'movie';
      const { data: existing } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('tmdb_id', t.id)
        .eq('media_type', type)
        .maybeSingle();
      if (existing) {
        await supabase.from('favorites').delete().eq('id', existing.id);
      } else {
        await supabase.from('favorites').insert({
          user_id: user.id,
          tmdb_id: t.id,
          media_type: type,
          title: titleName(t),
          poster_path: t.poster_path,
          backdrop_path: t.backdrop_path,
          vote_average: t.vote_average,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FAV_KEY, user?.id] }),
  });
}

export function useIsFavorite(tmdbId: number, mediaType: MediaType) {
  const favs = useFavorites();

  const row = favs.data?.find(
    (f) => f.tmdb_id === tmdbId && f.media_type === mediaType
  );

  return !!row;
}

export { img };






