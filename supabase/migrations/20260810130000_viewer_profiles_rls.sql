-- Perfis de exibição: garante a tabela e as políticas RLS (idempotente).
-- Se a tabela já existir (criada pelo painel do Supabase), apenas reforça RLS.

create table if not exists public.viewer_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  avatar_url text not null default '',
  is_kid boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.viewer_profiles to authenticated;
grant all on public.viewer_profiles to service_role;

alter table public.viewer_profiles enable row level security;

drop policy if exists "own viewer profiles" on public.viewer_profiles;
create policy "own viewer profiles"
on public.viewer_profiles
for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists viewer_profiles_owner_idx
  on public.viewer_profiles (owner_id);
