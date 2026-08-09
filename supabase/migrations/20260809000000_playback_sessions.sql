-- Controle de telas simultaneas por assinatura
create table if not exists public.playback_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  last_seen timestamptz not null default now(),
  unique (user_id, device_id)
);

grant select, insert, update, delete on public.playback_sessions to authenticated;
grant all on public.playback_sessions to service_role;

alter table public.playback_sessions enable row level security;

drop policy if exists "own playback sessions" on public.playback_sessions;
create policy "own playback sessions"
on public.playback_sessions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists playback_sessions_user_seen_idx
  on public.playback_sessions (user_id, last_seen desc);
