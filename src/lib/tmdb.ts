import type { MediaType, TmdbPage, TmdbTitle, TmdbVideo } from '@/types';

const IMG_BASE = 'https://image.tmdb.org/t/p';

// A chave da TMDb vive no servidor (backend/server.js) e é acessada pelo
// frontend via proxy /api/tmdb. Em produção, defina VITE_API_URL apontando
// para o backend; vazio = mesma origem (Vite dev proxy cuida de /api no dev).
const API_URL = (import.meta.env.VITE_API_URL as string) ?? '';

export const img = (path: string | null, size: 'w300' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500') =>
  path ? `${IMG_BASE}/${size}${path}` : '';

export const titleName = (t: TmdbTitle): string => t.title ?? t.name ?? t.original_title ?? t.original_name ?? 'Sem título';

export const titleYear = (t: TmdbTitle): string => {
  const d = t.release_date ?? t.first_air_date;
  return d ? d.slice(0, 4) : '';
};

export const titleMediaType = (t: TmdbTitle): MediaType =>
  t.media_type === 'tv' || t.media_type === 'movie' ? t.media_type : t.first_air_date || t.name ? 'tv' : 'movie';

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const search = new URLSearchParams();
  search.set('language', 'pt-BR');
  Object.entries(params).forEach(([k, v]) => search.set(k, String(v)));

  const query = search.toString();
  const res = await fetch(`${API_URL}/api/tmdb${path}${query ? `?${query}` : ''}`);

  if (!res.ok) throw new Error(`TMDb ${res.status}`);
  return res.json() as Promise<T>;
}

export const tmdb = {
  trending: (window: 'day' | 'week' = 'week') => tmdbFetch<TmdbPage<TmdbTitle>>('/trending/all/' + window),
  trendingMovies: () => tmdbFetch<TmdbPage<TmdbTitle>>('/trending/movie/week'),
  trendingTv: () => tmdbFetch<TmdbPage<TmdbTitle>>('/trending/tv/week'),
  popularMovies: (page = 1) => tmdbFetch<TmdbPage<TmdbTitle>>('/movie/popular', { page }),
  popularTv: (page = 1) => tmdbFetch<TmdbPage<TmdbTitle>>('/tv/popular', { page }),
  topRatedMovies: (page = 1) => tmdbFetch<TmdbPage<TmdbTitle>>('/movie/top_rated', { page }),
  topRatedTv: (page = 1) => tmdbFetch<TmdbPage<TmdbTitle>>('/tv/top_rated', { page }),
  nowPlaying: () => tmdbFetch<TmdbPage<TmdbTitle>>('/movie/now_playing'),
  airingToday: () => tmdbFetch<TmdbPage<TmdbTitle>>('/tv/airing_today'),
  byGenreMovie: (genreId: number, page = 1) =>
    tmdbFetch<TmdbPage<TmdbTitle>>('/discover/movie', { with_genres: genreId, sort_by: 'popularity.desc', page }),
  byGenreTv: (genreId: number, page = 1) =>
    tmdbFetch<TmdbPage<TmdbTitle>>('/discover/tv', { with_genres: genreId, sort_by: 'popularity.desc', page }),
  anime: (page = 1) =>
    tmdbFetch<TmdbPage<TmdbTitle>>('/discover/tv', {
      with_genres: 16,
      with_keywords: 210024,
      sort_by: 'popularity.desc',
      page,
    }),
  documentaries: (page = 1) =>
    tmdbFetch<TmdbPage<TmdbTitle>>('/discover/movie', { with_genres: 99, sort_by: 'popularity.desc', page }),
  kids: (page = 1) =>
    tmdbFetch<TmdbPage<TmdbTitle>>('/discover/movie', {
      with_genres: '10751,16',
      sort_by: 'popularity.desc',
      'certification_country': 'BR',
      page,
    }),
  search: (query: string, page = 1) =>
    tmdbFetch<TmdbPage<TmdbTitle>>('/search/multi', { query, page, include_adult: false }),
  details: (type: MediaType, id: number) => tmdbFetch<TmdbTitle>(`/${type}/${id}`, { append_to_response: 'videos,credits,similar' }),
  videos: (type: MediaType, id: number) => tmdbFetch<{ results: TmdbVideo[] }>(`/${type}/${id}/videos`),
  genres: (type: MediaType) => tmdbFetch<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`),
};

export function pickTrailer(videos?: TmdbVideo[]): TmdbVideo | null {
  if (!videos || !videos.length) return null;
  const yt = videos.filter((v) => v.site === 'YouTube');
  return (
    yt.find((v) => v.type === 'Trailer' && v.official) ||
    yt.find((v) => v.type === 'Trailer') ||
    yt.find((v) => v.type === 'Teaser') ||
    yt[0] ||
    null
  );
}
