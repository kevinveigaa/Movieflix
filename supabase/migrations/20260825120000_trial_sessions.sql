-- 20260825120000_trial_sessions.sql
-- Teste grátis de 20 segundos — controle SERVER-SIDE (tabela no banco).
--
-- Cada usuário tem UMA linha (user_id = PK). Regras:
--   * `trial_seconds`    → 20 segundos de teste por conta (padrão).
--   * `consumed_seconds` → total de segundos de teste já usados (atualizado a
--     cada batida de heartbeat; nunca pode passar de trial_seconds).
--   * `consumed_at`      → instante em que o teste esgotou (NULL enquanto há
--     tempo disponível). Com consumido, a tabela trava via CHECK e o endpoint
--     server-side recusa qualquer novo stream até o usuário assinar.
--   * `expires_at`       → janela de validade do teste (7 dias após a 1ª vez).
--     Depois dela o teste também é recusado (mesmo que sobre tempo).
--
-- A tabela é protegida por RLS REST (auth.uid() = user_id) e o endpoint
-- /api/trial-gate (backend) é quem autoriza/nega o stream: o usuário NÃO pode
-- burlar recarregando a página, trocando de dispositivo ou fechando o player —
-- a autorização é validada no servidor contra o estado persistido no banco.

create table if not exists public.trial_sessions (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  trial_seconds    integer not null default 20,
  consumed_seconds integer not null default 0,
  consumed_at      timestamptz,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint trial_seconds_positive check (trial_seconds > 0),
  constraint consumed_not_negative check (consumed_seconds >= 0),
  constraint consumed_within_limit check (consumed_seconds <= trial_seconds)
);

-- Somente o backend (service_role) grava; o usuário só lê a própria linha
-- (o front usa isso para mostrar o contador restante).
grant select on public.trial_sessions to authenticated;
grant all on public.trial_sessions to service_role;

alter table public.trial_sessions enable row level security;

drop policy if exists "own trial session read" on public.trial_sessions;
create policy "own trial session read"
  on public.trial_sessions for select
  to authenticated
  using (auth.uid() = user_id);

-- Função usada pelo backend (service_role) para consumir tempo de teste de
-- forma atômica: retorna o tempo restante em segundos (ou 0 se esgotado).
create or replace function public.consume_trial_time(p_user_id uuid, p_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_now timestamptz := now();
begin
  if p_user_id is null or p_seconds is null or p_seconds <= 0 then
    return 0;
  end if;

  insert into public.trial_sessions (user_id, trial_seconds, consumed_seconds, expires_at)
  values (p_user_id, 20, 0, v_now + interval '7 days')
  on conflict (user_id) do nothing;

  update public.trial_sessions
     set consumed_seconds = least(trial_seconds, consumed_seconds + p_seconds),
         consumed_at = case
           when least(trial_seconds, consumed_seconds + p_seconds) >= trial_seconds then v_now
           else consumed_at
         end,
         updated_at = v_now
   where user_id = p_user_id;

  select greatest(0, trial_seconds - consumed_seconds)
    into v_remaining
    from public.trial_sessions
   where user_id = p_user_id;

  return v_remaining;
end;
$$;

-- Função usada pelo backend (service_role) para verificar o estado do teste:
-- retorna 0 se esgotado/expirado, ou os segundos restantes.
create or replace function public.trial_remaining_seconds(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_expires  timestamptz;
begin
  select greatest(0, trial_seconds - consumed_seconds), expires_at
    into v_remaining, v_expires
    from public.trial_sessions
   where user_id = p_user_id;

  if v_remaining is null then
    return 20; -- nunca usou o teste: ainda tem os 20s
  end if;

  if v_expires is not null and v_expires < now() then
    return 0; -- janela de 7 dias expirou
  end if;

  return v_remaining;
end;
$$;
