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

/**
 * Favorito por título del catálogo (movies.id). Los cards del catálogo apuntan
 * a movies.id (UUID), así que este hook es el que usan para el botón de
 * corazón. Guarda también tmdb_id/media_type cuando están disponibles.
 */
export function useFavoriteByMovieId(movieId: string, mediaType: MediaType) {
  const { user, activeViewerProfile } = useAuth();
  const profileId = activeViewerProfile?.id;
  const qc = useQueryClient();
  const favs = useFavorites();
  const row = favs.data?.find((f) => f.movie_id === movieId);
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
          movie_id: movieId,
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

export function useIsFavoriteByMovieId(movieId: string) {
  const favs = useFavorites();
  const row = favs.data?.find((f) => f.movie_id === movieId);
  return !!row;
}

export { img };