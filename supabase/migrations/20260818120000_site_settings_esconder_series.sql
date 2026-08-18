-- Configurações globais do site (ex.: esconder séries do cliente).
-- A linha `series_hidden = true` faz o site mostrar só filmes; o painel admin
-- alterna esse valor. Nada é removido: séries, temporadas e episódios continuam
-- intactos no banco e reaparecem quando `series_hidden` volta a `false`.

create table if not exists public.site_settings (
  key text primary key,
  value boolean not null default false,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.site_settings to anon, authenticated;
grant all on public.site_settings to service_role;

alter table public.site_settings enable row level security;

drop policy if exists "permitir ler site_settings" on public.site_settings;
create policy "permitir ler site_settings"
  on public.site_settings for select to public using (true);

drop policy if exists "permitir gravar site_settings" on public.site_settings;
create policy "permitir gravar site_settings"
  on public.site_settings for insert to public with check (true);

drop policy if exists "permitir atualizar site_settings" on public.site_settings;
create policy "permitir atualizar site_settings"
  on public.site_settings for update to public using (true) with check (true);

-- Estado inicial: séries ocultas (foco em filmes). O admin pode reativar.
insert into public.site_settings (key, value)
values ('series_hidden', true)
on conflict (key) do nothing;
