import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { favoritesColumns } from '@/lib/favoritesColumns';
import { useMovies, type CatalogMovie } from '@/hooks/useMovies';
import type { MediaType } from '@/types';

const FAV_KEY = 'favorites';

/** Chave da query: os favoritos são por perfil (quando existe perfil ativo). */
function favoritesKey(userId?: string, profileId?: string) {
  return [FAV_KEY, userId, profileId ?? 'default'];
}

/**
 * Resolve um título do catálogo (movies.id = String(tmdb_id)) para o tmdb_id
 * numérico usado pela tabela `favorites`. O catálogo é a fonte de verdade:
 * `id` e `tmdb_id` são o mesmo valor (id = String(tmdb_id)).
 */
function catalogTmdbId(movieId: string | number | null | undefined): number | null {
  if (movieId === null || movieId === undefined) return null;
  const n = Number(movieId);
  return Number.isFinite(n) && n > 0 ? n : null;
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

/**
 * Favorito por título do catálogo (movies.id). Os cards do catálogo apontam
 * para movies.id (que é o tmdb_id como string), então este hook é o que usam
 * para o botão de coração. Guarda tmdb_id/media_type na tabela `favorites`
 * (a coluna movie_id só é usada quando a migration já foi aplicada no banco).
 */
export function useFavoriteByMovieId(movieId: string, mediaType: MediaType) {
  const { user, activeViewerProfile } = useAuth();
  const profileId = activeViewerProfile?.id;
  const qc = useQueryClient();
  const favs = useFavorites();
  const tmdbId = catalogTmdbId(movieId);

  // Compatível com registros antigos (tmdb_id) e novos (movie_id quando existir).
  const row = favs.data?.find(
    (f) =>
      (tmdbId !== null && Number(f.tmdb_id) === tmdbId) ||
      (f.movie_id && String(f.movie_id) === String(movieId)),
  );
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
          title: '',
          poster_path: '',
          backdrop_path: '',
          vote_average: 0,
        };
        // Só grava movie_id quando a coluna existe no banco (migration aplicada).
        if (cols.movieId) insert.movie_id = movieId;
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
  const tmdbId = catalogTmdbId(movieId);
  return !!favs.data?.find(
    (f) =>
      (tmdbId !== null && Number(f.tmdb_id) === tmdbId) ||
      (f.movie_id && String(f.movie_id) === String(movieId)),
  );
}

/**
 * Favoritos resolvidos contra o catálogo real (useMovies). Cada favorito é
 * casado por tmdb_id com um título do catálogo; favoritos cujo tmdb_id não
 * existe no catálogo são filtrados (nunca renderizam títulos inexistentes).
 * O retorno usa os dados do catálogo (título, capa, ano, nota) — não o
 * snapshot possivelmente vazio gravado na tabela.
 */
export function useCatalogFavorites() {
  const favs = useFavorites();
  const movies = useMovies();

  const byTmdb = new Map<number, CatalogMovie>();
  for (const m of movies.data ?? []) {
    const t = Number(m.tmdb_id ?? m.id);
    if (Number.isFinite(t) && t > 0) byTmdb.set(t, m);
  }

  const items = (favs.data ?? [])
    .map((f) => {
      const movie = byTmdb.get(Number(f.tmdb_id));
      if (!movie) return null;
      return { favorite: f, movie };
    })
    .filter((x): x is { favorite: any; movie: CatalogMovie } => Boolean(x));

  return {
    isLoading: favs.isLoading || movies.isLoading,
    items,
    raw: favs.data ?? [],
  };
}