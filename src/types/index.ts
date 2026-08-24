export type MediaType = 'movie' | 'tv';

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbTitle {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  media_type?: MediaType | 'person';
  popularity?: number;
}

export interface TmdbVideo {
  id: string;
  key: string;
  site: string;
  type: string;
  name: string;
  official: boolean;
}

export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  description: string;
  features: string[];
  is_active: boolean;
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'past_due';

export interface Subscription {
  plan?: Plan;
  id: string;
  user_id: string;
  /** Código do plano ('simple', 'standard', 'premium'). Pode vir nulo ou conter o UUID do plano em registros antigos. */
  plan_code: string | null;
  /** UUID do plano na tabela plans. Pode vir nulo em registros antigos. */
  plan_id?: string | null;

  status: SubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
  updated_at: string;
  created_at: string;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Payment {
  id: string;
  user_id: string;
  subscription_id: string | null;
  plan_code: string;
  
  amount_cents: number;
  status: PaymentStatus;
  provider: string;
  provider_payment_id: string | null;
  pix_code: string | null;
  pix_qr_base64: string | null;
  created_at: string;
  updated_at: string;
}

export interface ViewerProfile {
  id: string;
  owner_id: string;
  name: string;
  avatar_url: string;
  is_kid: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface FavoriteRow {
  id: string;
  user_id: string;
  /** Perfil que favoritou (null = registros antigos, sem perfil). */
  viewer_profile_id: string | null;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  created_at: string;
}

export interface WatchHistoryRow {
  id: string;
  user_id: string;
  /** Perfil que assistiu (null = registros antigos, sem perfil). */
  viewer_profile_id: string | null;
  /** Título do catálogo (movies.id). Quando null, o registro aponta para tmdb_id. */
  movie_id: string | null;
  tmdb_id: number | null;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  position_seconds: number;
  duration_seconds: number;
  /** Série: temporada/episódio assistidos (migration 20260824120000). */
  season_number: number | null;
  episode_number: number | null;
  updated_at: string;
}
