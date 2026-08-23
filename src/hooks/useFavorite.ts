import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { favoritesColumns } from '@/lib/favoritesColumns';
import { img, titleName } from '@/lib/tmdb';
import type { MediaType, TmdbTitle } from '@/types';

const FAV_KEY = 'favorites';

/** Chave da query: os favoritos são por perfil (quando existe perfil ativo). */
function favoritesKey(userId?: string, profileId?: string) {
  return [FAV_KEY, userId, profileId ?? 'default'];
}

export function useFavorites() {
  const { user, activeViewerProfile } = useAuth();
  const profileId = activeViewerProfile?.id;
  return useQuery({
    queryKey: favoritesKey(user?.id, profileId),
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const cols = await favoritesColumns();

      let query = supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id);

      // Com a coluna de perfil: filtra pelo perfil ativo (ou registros antigos
      // sem perfil quando nenhum está seleccionado).
      if (cols.viewerProfileId) {
        if (profileId) query = query.eq('viewer_profile_id', profileId);
        else query = query.is('viewer_profile_id', null);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useFavorite(tmdbId: number, mediaType: MediaType) {
  const { user, activeViewerProfile } = useAuth();
  const profileId = activeViewerProfile?.id;
  const qc = useQueryClient();
  const favs = useFavorites();
  const row = favs.data?.find((f) => f.tmdb_id === tmdbId && f.media_type === mediaType);
  const isFavorite = !!row;

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Faça login para favoritar.');
      const cols = await favoritesColumns();
      if (row) {
        await supabase.from('favorites').delete().eq('id', row.id);
      } else {
        const insert: Record<string, unknown> = {
          user_id: user.id,
          tmdb_id: tmdbId,
          media_type: mediaType,
          title: "",
          poster_path: "",
          backdrop_path: "",
          vote_average: 0,
        };
        if (cols.viewerProfileId) insert.viewer_profile_id = profileId;
        await supabase.from('favorites').insert(insert);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FAV_KEY, user?.id] }),
  });

  return { isFavorite, toggle: toggle.mutate, loading: toggle.isPending };
}

export function useToggleFavoriteByTitle() {
  const { user, activeViewerProfile } = useAuth();
  const profileId = activeViewerProfile?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: TmdbTitle) => {
      if (!user) throw new Error('Faça login para favoritar.');
      const cols = await favoritesColumns();
      const type: MediaType = t.media_type === 'tv' || t.first_air_date || t.name ? 'tv' : 'movie';
      let find = supabase
        .from('favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('tmdb_id', t.id)
        .eq('media_type', type);

      if (cols.viewerProfileId) {
        if (profileId) find = find.eq('viewer_profile_id', profileId);
        else find = find.is('viewer_profile_id', null);
      }

      const { data: existing } = await find.maybeSingle();
      if (existing) {
        await supabase.from('favorites').delete().eq('id', existing.id);
      } else {
        const insert: Record<string, unknown> = {
          user_id: user.id,
          tmdb_id: t.id,
          media_type: type,
          title: titleName(t),
          poster_path: t.poster_path,
          backdrop_path: t.backdrop_path,
          vote_average: t.vote_average,
        };
        if (cols.viewerProfileId) insert.viewer_profile_id = profileId;
        await supabase.from('favorites').insert(insert);
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