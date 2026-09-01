-- Mimic Supabase schema for local validation
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  price_cents integer not null,
  duration_days integer not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id),
  plan_code text,
  status text not null default 'active',
  starts_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id),
  plan_code text,
  amount_cents integer,
  status text,
  provider text,
  provider_payment_id text,
  external_reference text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed plans (Plano 1/2/3)
insert into public.plans (code, name, price_cents, duration_days, is_active) values
  ('simple',   'Plano 1', 1990, 30, true),
  ('standard', 'Plano 2', 2990, 30, true),
  ('premium',  'Plano 3', 3990, 30, true)
on conflict (code) do nothing;

-- Seed users: one admin, one normal, one test user
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@movieflix.test'),
  ('00000000-0000-0000-0000-000000000002', 'cliente@movieflix.test'),
  ('00000000-0000-0000-0000-000000000003', 'teste.ativacao@movieflix.test')
on conflict (id) do nothing;

insert into public.profiles (id, email, is_admin) values
  ('00000000-0000-0000-0000-000000000001', 'admin@movieflix.test', true),
  ('00000000-0000-0000-0000-000000000002', 'cliente@movieflix.test', false),
  ('00000000-0000-0000-0000-000000000003', 'teste.ativacao@movieflix.test', false)
on conflict (id) do nothing;

-- auth.uid() helper for local testing (returns the "current" user via a GUC)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;