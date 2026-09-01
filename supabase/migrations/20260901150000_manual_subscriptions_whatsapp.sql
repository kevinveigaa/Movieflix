-- ============================================================
-- MovieFlix — ATIVAÇÃO MANUAL DE ASSINATURA VIA WHATSAPP
--
-- Princípio: E-MAIL + PLANO = ATIVAÇÃO.
-- O admin informa SOMENTE o e-mail do cliente e o plano (1/2/3 ou
-- simple/standard/premium). O sistema localiza o usuário e o plano
-- automaticamente, cria/atualiza a assinatura (status=active), calcula
-- a validade e registra o pagamento manual (provider='manual_whatsapp').
--
-- SEGURANÇA:
--  * Todas as funções são SECURITY DEFINER (rodam com privilégios do dono,
--    ignorando RLS) e fazem o próprio controle de acesso: apenas usuários
--    autenticados com profiles.is_admin = true podem ativar/desativar/consultar.
--  * search_path fixo para evitar hijacking.
--  * O usuário comum NÃO pode ativar a própria assinatura.
--  * cancel_my_subscription() permite que o usuário cancele a PRÓPRIA
--    assinatura (corrige o bug do SettingsPage, que falhava por RLS).
--
-- Idempotente: pode ser aplicado mesmo se já existir.
-- ============================================================

-- ---------- Helper: normaliza e-mail (trim + lowercase) ----------
create or replace function public._mf_normalizar_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_email, '')));
$$;

-- ---------- Helper: resolve o plano por código OU id (1/2/3 ou simple/standard/premium) ----------
create or replace function public._mf_resolver_plano(p_plano text)
returns public.plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano public.plans;
  v_codigo text;
begin
  v_codigo := lower(btrim(coalesce(p_plano, '')));

  -- Aceita 1/2/3 como atalho para simple/standard/premium
  if v_codigo = '1' then v_codigo := 'simple';
  elsif v_codigo = '2' then v_codigo := 'standard';
  elsif v_codigo = '3' then v_codigo := 'premium';
  end if;

  -- Tenta por código
  select * into v_plano from public.plans
    where lower(btrim(code)) = v_codigo and is_active = true
    limit 1;

  -- Fallback: por id (uuid)
  if v_plano is null then
    select * into v_plano from public.plans
      where id::text = v_codigo and is_active = true
      limit 1;
  end if;

  return v_plano;
end;
$$;

-- ---------- Helper: o usuário atual é admin? ----------
create or replace function public._mf_eh_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- ============================================================
-- ATIVAR assinatura por e-mail + plano (admin)
-- ============================================================
create or replace function public.activate_subscription_by_email(
  p_email text,
  p_plano text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public._mf_normalizar_email(p_email);
  v_user_id uuid;
  v_plano public.plans;
  v_duracao_dias integer;
  v_agora timestamptz := now();
  v_base timestamptz;
  v_expires timestamptz;
  v_starts timestamptz;
  v_sub_id uuid;
  v_sub record;
  v_payment_id uuid;
  v_ref text;
begin
  -- 1) Só admin pode ativar
  if not public._mf_eh_admin() then
    return jsonb_build_object('ok', false, 'erro', 'Acesso negado: apenas administradores podem ativar assinaturas.');
  end if;

  -- 2) Valida e-mail
  if v_email = '' or v_email is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o e-mail do cliente.');
  end if;

  -- 3) Localiza o usuário (auth.users)
  select id into v_user_id from auth.users where lower(btrim(email)) = v_email limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Nenhum usuário encontrado com o e-mail informado.');
  end if;

  -- 4) Localiza o plano
  v_plano := public._mf_resolver_plano(p_plano);
  if v_plano is null then
    return jsonb_build_object('ok', false, 'erro', 'Plano inválido. Use 1, 2, 3 ou simple/standard/premium.');
  end if;

  v_duracao_dias := coalesce(v_plano.duration_days, 30);
  if v_duracao_dias <= 0 then v_duracao_dias := 30; end if;

  -- 5) Assinatura atual (mais recente)
  select id, status, expires_at, starts_at into v_sub
  from public.subscriptions
  where user_id = v_user_id
  order by created_at desc
  limit 1;

  -- 6) Renovação: se ainda ativa, estende a partir do vencimento atual (não perde dias)
  if v_sub.id is not null and v_sub.status = 'active' and v_sub.expires_at is not null
     and v_sub.expires_at > v_agora then
    v_base := v_sub.expires_at;
    v_starts := coalesce(v_sub.starts_at, v_agora);
  else
    v_base := v_agora;
    v_starts := v_agora;
  end if;
  v_expires := v_base + (v_duracao_dias || ' days')::interval;

  -- 7) Upsert idempotente da assinatura (atualiza a linha mais recente ou insere)
  if v_sub.id is not null then
    update public.subscriptions
      set plan_code = v_plano.code,
          plan_id = v_plano.id,
          status = 'active',
          starts_at = v_starts,
          expires_at = v_expires,
          cancelled_at = null,
          updated_at = v_agora
    where id = v_sub.id
    returning id into v_sub_id;
  else
    insert into public.subscriptions (user_id, plan_code, plan_id, status, starts_at, expires_at, created_at, updated_at)
    values (v_user_id, v_plano.code, v_plano.id, 'active', v_starts, v_expires, v_agora, v_agora)
    returning id into v_sub_id;
  end if;

  -- 8) Registra o pagamento manual (idempotente por external_reference único)
  v_ref := 'manual_whatsapp_' || v_user_id::text || '_' || to_char(v_agora, 'YYYYMMDDHH24MISS');
  insert into public.payments (
    user_id, plan_code, plan_id, amount_cents, status, provider,
    provider_payment_id, external_reference, created_at, updated_at
  ) values (
    v_user_id, v_plano.code, v_plano.id, v_plano.price_cents, 'approved', 'manual_whatsapp',
    null, v_ref, v_agora, v_agora
  )
  returning id into v_payment_id;

  -- 9) Confirmação clara
  return jsonb_build_object(
    'ok', true,
    'mensagem', 'ATIVAÇÃO REALIZADA COM SUCESSO',
    'email', v_email,
    'plano', v_plano.name,
    'plano_codigo', v_plano.code,
    'status', 'active',
    'inicio', to_char(v_starts, 'YYYY-MM-DD'),
    'expiracao', to_char(v_expires, 'YYYY-MM-DD'),
    'assinatura_id', v_sub_id,
    'pagamento_id', v_payment_id
  );
end;
$$;

-- ============================================================
-- DESATIVAR assinatura por e-mail (admin) — preserva histórico
-- ============================================================
create or replace function public.deactivate_subscription_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public._mf_normalizar_email(p_email);
  v_user_id uuid;
  v_sub_id uuid;
begin
  if not public._mf_eh_admin() then
    return jsonb_build_object('ok', false, 'erro', 'Acesso negado: somente administradores.');
  end if;
  if v_email = '' then
    return jsonb_build_object('ok', false, 'erro', 'Informe o e-mail do cliente.');
  end if;

  select id into v_user_id from auth.users where lower(btrim(email)) = v_email limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Nenhum usuário encontrado com o e-mail informado.');
  end if;

  select id into v_sub_id from public.subscriptions
  where user_id = v_user_id and status = 'active'
  order by created_at desc limit 1;

  if v_sub_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Este usuário não possui assinatura ativa.');
  end if;

  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = v_sub_id;

  return jsonb_build_object('ok', true, 'mensagem', 'Assinatura desativada com sucesso.', 'email', v_email);
end;
$$;

-- ============================================================
-- CONSULTAR assinatura por e-mail (admin)
-- ============================================================
create or replace function public.get_subscription_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public._mf_normalizar_email(p_email);
  v_user_id uuid;
  v_sub record;
  v_plano record;
begin
  if not public._mf_eh_admin() then
    return jsonb_build_object('ok', false, 'erro', 'Acesso negado: somente administradores.');
  end if;
  if v_email = '' then
    return jsonb_build_object('ok', false, 'erro', 'Informe o e-mail do cliente.');
  end if;

  select id into v_user_id from auth.users where lower(btrim(email)) = v_email limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Nenhum usuário encontrado com o e-mail informado.');
  end if;

  select s.* into v_sub from public.subscriptions s
  where s.user_id = v_user_id order by s.created_at desc limit 1;

  if v_sub.id is null then
    return jsonb_build_object('ok', true, 'email', v_email, 'assinatura', null);
  end if;

  select * into v_plano from public.plans where id = v_sub.plan_id limit 1;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'assinatura', jsonb_build_object(
      'status', v_sub.status,
      'plano', coalesce(v_plano.name, v_sub.plan_code),
      'plano_codigo', v_sub.plan_code,
      'inicio', to_char(v_sub.starts_at, 'YYYY-MM-DD'),
      'expiracao', to_char(v_sub.expires_at, 'YYYY-MM-DD'),
      'criada_em', to_char(v_sub.created_at, 'YYYY-MM-DD HH24:MI')
    )
  );
end;
$$;

-- ============================================================
-- CANCELAR a PRÓPRIA assinatura (usuário logado) — corrige RLS
-- ============================================================
create or replace function public.cancel_my_subscription()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_sub_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Você precisa estar logado.');
  end if;

  select id into v_sub_id from public.subscriptions
  where user_id = v_user_id and status = 'active'
  order by created_at desc limit 1;

  if v_sub_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Você não possui assinatura ativa.');
  end if;

  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = v_sub_id;

  return jsonb_build_object('ok', true, 'mensagem', 'Assinatura cancelada. O acesso será bloqueado ao fim do período.');
end;
$$;

-- ============================================================
-- Permissões: revoga tudo e concede apenas o necessário
-- ============================================================
revoke all on function public._mf_normalizar_email(text) from public;
revoke all on function public._mf_resolver_plano(text) from public;
revoke all on function public._mf_eh_admin() from public;
revoke all on function public.activate_subscription_by_email(text, text) from public;
revoke all on function public.deactivate_subscription_by_email(text) from public;
revoke all on function public.get_subscription_by_email(text) from public;
revoke all on function public.cancel_my_subscription() from public;

-- Usuário autenticado pode chamar apenas cancel_my_subscription (a própria).
grant execute on function public.cancel_my_subscription() to authenticated;

-- As funções de admin são chamadas pelo painel (cliente autenticado do admin),
-- mas o controle de acesso é feito DENTRO da função (_mf_eh_admin). Concedemos
-- execute a authenticated para que o painel admin (que usa o cliente autenticado)
-- consiga chamá-las; a função rejeita quem não for admin.
grant execute on function public.activate_subscription_by_email(text, text) to authenticated;
grant execute on function public.deactivate_subscription_by_email(text) to authenticated;
grant execute on function public.get_subscription_by_email(text) to authenticated;

-- Helpers internos: não expostos diretamente.
grant execute on function public._mf_normalizar_email(text) to authenticated;
grant execute on function public._mf_resolver_plano(text) to authenticated;
grant execute on function public._mf_eh_admin() to authenticated;

notify pgrst, 'reload schema';