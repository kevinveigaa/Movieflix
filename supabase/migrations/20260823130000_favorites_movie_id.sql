-- Favoritos por t\u00edtulo del cat\u00e1logo (movies.id).
-- Permite guardar como favorito un t\u00edtulo del cat\u00e1logo local (movies.id,
-- UUID) adem\u00e1s del tmdb_id. As\u00ed el bot\u00f3n de coraz\u00f3n de los cards
-- (que apuntan a movies.id) funciona de forma fiable.

alter table public.favorites
  add column if not exists movie_id uuid
    references public.movies(id) on delete set null;

create index if not exists favorites_movie_idx
  on public.favorites (user_id, movie_id);