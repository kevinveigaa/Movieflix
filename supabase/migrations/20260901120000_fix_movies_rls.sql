-- 20260901120000_fix_movies_rls.sql
-- CORREÇÃO DE SEGURANÇA: a tabela `movies` tinha policies que permitiam
-- INSERT/DELETE/UPDATE para o papel `anon` (público, sem login). Qualquer
-- pessoa podia apagar/alterar/injetar títulos no catálogo.
--
-- Correção:
--   * Habilita RLS na tabela (se ainda não estiver).
--   * Mantém LEITURA pública (o catálogo é lido pelo app com a chave anon).
--   * Restringe ESCRITA (insert/update/delete) a usuários autenticados que
--     sejam ADMIN (profiles.is_admin = true). O painel admin usa o cliente
--     autenticado do Supabase, então continua funcionando.
--   * O backend (service_role) ignora RLS e continua podendo escrever.

-- 1) Garante RLS habilitado.
alter table public.movies enable row level security;

-- 2) Remove as policies anônimas de escrita (gambiarras antigas).
drop policy if exists "permitir insert movies" on public.movies;
drop policy if exists "permitir delete movies" on public.movies;
drop policy if exists "permitir update movies" on public.movies;

-- 3) Leitura pública (qualquer um pode ler o catálogo).
drop policy if exists "movies public read" on public.movies;
create policy "movies public read"
  on public.movies for select
  to anon, authenticated
  using (true);

-- 4) Escrita apenas para ADMIN autenticado (profiles.is_admin = true).
drop policy if exists "movies admin insert" on public.movies;
create policy "movies admin insert"
  on public.movies for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "movies admin update" on public.movies;
create policy "movies admin update"
  on public.movies for update
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "movies admin delete" on public.movies;
create policy "movies admin delete"
  on public.movies for delete
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 5) Mesma proteção para seasons e episodes (usadas pelo painel admin).
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;

drop policy if exists "seasons public read" on public.seasons;
create policy "seasons public read"
  on public.seasons for select
  to anon, authenticated
  using (true);

drop policy if exists "seasons admin write" on public.seasons;
create policy "seasons admin write"
  on public.seasons for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "episodes public read" on public.episodes;
create policy "episodes public read"
  on public.episodes for select
  to anon, authenticated
  using (true);

drop policy if exists "episodes admin write" on public.episodes;
create policy "episodes admin write"
  on public.episodes for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

notify pgrst, 'reload schema';