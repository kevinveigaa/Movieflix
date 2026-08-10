-- Histórico de reprodução por perfil e por título do catálogo (movies.id).
-- Torna o "Continuar assistindo" independente entre os perfis e permite
-- retomar exatamente o título da tabela `movies` usado pelo player.

alter table public.watch_history
  add column if not exists viewer_profile_id uuid
    references public.viewer_profiles(id) on delete set null;

alter table public.watch_history
  add column if not exists movie_id uuid
    references public.movies(id) on delete set null;

-- Títulos do catálogo (movies) não têm tmdb_id: permite registros sem TMDb.
alter table public.watch_history
  alter column tmdb_id drop not null;

create index if not exists watch_history_profile_idx
  on public.watch_history (user_id, viewer_profile_id, updated_at desc);

create index if not exists watch_history_movie_idx
  on public.watch_history (user_id, movie_id);
