import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { watchHistoryColumns } from '@/lib/watchHistoryColumns';
import { useMovies, type CatalogMovie } from '@/hooks/useMovies';
import { temProgressoReal, ehProgressoLixo } from '@/lib/watchProgress';
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

/**
 * Histórico resolvido contra o catálogo real (useMovies). Cada registro é
 * casado por tmdb_id com um título do catálogo; registros cujo tmdb_id não
 * existe no catálogo são filtrados (nunca mostram títulos inexistentes).
 * O retorno usa os dados do catálogo (título, capa, ano) — não o snapshot
 * possivelmente vazio gravado na tabela.
 */
export function useCatalogWatchHistory() {
  const history = useWatchHistory();
  const movies = useMovies();

  const byTmdb = new Map<number, CatalogMovie>();
  for (const m of movies.data ?? []) {
    const t = Number(m.tmdb_id ?? m.id);
    if (Number.isFinite(t) && t > 0) byTmdb.set(t, m);
  }

  const items = (history.data ?? [])
    .map((h) => {
      const movie = byTmdb.get(Number(h.tmdb_id));
      if (!movie) return null;
      // Só progresso REAL: >= 10 min (ou 30% da duração) e nunca "lixo"
      // (posição 0 / duração 0 gravados por bugs antigos ao simplesmente
      // abrir o player). Títulos já concluídos (>= 95%) também saem.
      if (ehProgressoLixo(h.position_seconds, h.duration_seconds)) return null;
      if (!temProgressoReal(h.position_seconds, h.duration_seconds)) return null;
      return { history: h, movie };
    })
    .filter((x): x is { history: WatchHistoryRow; movie: CatalogMovie } => Boolean(x));

  return {
    isLoading: history.isLoading || movies.isLoading,
    items,
    raw: history.data ?? [],
  };
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
  /** Série: temporada/episódio assistidos (para mostrar "T1 · E3" na retomada). */
  season?: number | null;
  episode?: number | null;
}

/** Busca o registro de reprodução de um título do catálogo (para retomar). */
export async function fetchHistoryForMovie(
  userId: string,
  profileId: string | null,
  movieId: string,
): Promise<WatchHistoryRow | null> {
  try {
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
  } catch (erro) {
    // Falha de rede/RLS/Supabase: sem histórico de retomada, sem crash.
    console.error('[fetchHistoryForMovie] falha ao buscar histórico:', erro);
    return null;
  }
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

      const patch: Record<string, unknown> = {
        position_seconds: args.positionSeconds,
        duration_seconds: args.durationSeconds,
        title: args.title,
        poster_path: args.posterPath ?? null,
        backdrop_path: args.backdropPath ?? null,
        updated_at: new Date().toISOString(),
      };
      // Só grava temporada/episódio quando a coluna existe no banco
      // (migration 20260824120000 aplicada).
      if (cols.seasonEpisode) {
        patch.season_number = args.season ?? null;
        patch.episode_number = args.episode ?? null;
      }

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
          season_number: args.season ?? null,
          episode_number: args.episode ?? null,
        };
        if (cols.movieId && args.movieId) insert.movie_id = args.movieId;
        if (cols.viewerProfileId) insert.viewer_profile_id = profileId;
        if (cols.seasonEpisode) {
          insert.season_number = args.season ?? null;
          insert.episode_number = args.episode ?? null;
        }
        await supabase.from('watch_history').insert(insert);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useClearHistory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase.from('watch_history').delete().eq('user_id', user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useMarkAsWatched() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) return;
      await supabase.from('watch_history').update({
        position_seconds: 999999,
        duration_seconds: 999999,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
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