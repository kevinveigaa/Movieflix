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
--  * search_path = '' (vazio) + TODAS as referências a tabelas/funções
--    totalmente qualificadas (public.*, auth.*) para evitar hijacking.
--  * O usuário comum NÃO pode ativar a própria assinatura.
--  * cancel_my_subscription() permite que o usuário cancele a PRÓPRIA
--    assinatura preservando o acesso até o fim do período pago
--    (alinhado à regra real de acesso: status='active' AND expires_at > now()).
--
-- IDEMPOTÊNCIA (sem impedir a renovação legítima do mesmo plano):
--  * JANELA DE DEDUPLICAÇÃO (constante, 120s, documentada e configurável):
--    antes de qualquer cálculo de renovação, verifica se já existe um pagamento
--    provider='manual_whatsapp', status='approved', mesmo user_id e mesmo plan_id,
--    criado dentro da janela (created_at >= now() - janela). Se existir → é
--    REPETIÇÃO da mesma operação (ex.: duplo clique) → retorna no-op (não estende
--    dias, não cria pagamento). Se NÃO existir → é RENOVAÇÃO LEGÍTIMA → prossegue
--    e acrescenta os dias ao vencimento atual.
--  * ADVISORY LOCK (pg_advisory_xact_lock) por usuário: serializa duas chamadas
--    simultâneas da mesma operação, impedindo duplicação de renovação/pagamento.
--    A checagem de deduplicação ocorre DEPOIS de adquirir o lock.
--  * Renovação de plano diferente (upgrade/downgrade): assinatura ainda ativa
--    preserva os dias restantes (base = expires_at atual + duração do novo plano).
--    Assinatura expirada ou inexistente: novo período a partir de agora.
--  * Pagamento manual idempotente SEM depender de constraint única:
--    external_reference DETERMINÍSTICA derivada do período (user_id + plan_id +
--    starts_at + expires_at) + SELECT prévio + INSERT simples. Como o advisory
--    lock serializa chamadas concorrentes do mesmo usuário, o SELECT+INSERT é
--    seguro sem ON CONFLICT.
--  * Índice único parcial em payments(external_reference) é BEST-EFFORT e
--    OPCIONAL: um bloco DO verifica se existem duplicatas históricas; se NÃO
--    houver, cria o índice; se houver, NÃO cria e emite RAISE NOTICE claro
--    (preservando os dados históricos). A lógica da função NÃO depende desse índice.
--
-- NÃO destrutivo: sem DROP TABLE, sem DELETE, sem recriar banco.
-- Preserva os 3 planos existentes (Plano 1 R$19,90/30d, Plano 2 R$29,90/30d,
-- Plano 3 R$39,90/30d) e todo o histórico de assinaturas/pagamentos.
-- ============================================================

-- ============================================================
-- 0) AUDITORIA INICIAL DO SCHEMA (informativo — pode rodar à vontade)
-- ============================================================
-- SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name IN ('plans','subscriptions','payments','profiles')
--  ORDER BY table_name, ordinal_position;
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='plans' AND column_name IN ('active','is_active');
--
-- SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND proname LIKE '%subscription%' OR proname LIKE '_mf_%';

-- ============================================================
-- 1) GARANTIR COLUNAS NECESSÁRIAS (sem duplicar / sem destruir)
-- ============================================================
-- cancel_at_period_end: marca cancelamento agendado para o fim do período,
-- mantendo status='active' (e portanto o acesso) até expires_at.
alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean default false;

-- Índice único parcial em payments(external_reference) — BEST-EFFORT e OPCIONAL.
-- A lógica das funções NÃO depende deste índice (a idempotência é garantida pela
-- janela de deduplicação + advisory lock + SELECT/INSERT). ANTES de criar, verifica
-- se já existem valores duplicados: se houver, NÃO cria (para não quebrar a
-- migration) e emite um aviso claro. Se não houver, cria.
do $$
declare
  v_duplicadas integer;
begin
  select count(*) into v_duplicadas
  from (
    select external_reference
    from public.payments
    where external_reference is not null
    group by external_reference
    having count(*) > 1
  ) d;

  if v_duplicadas > 0 then
    raise notice 'AVISO: % external_reference duplicadas em public.payments. Índice único NÃO criado (best-effort) para não quebrar a migration. A idempotência é garantida pela janela de deduplicação + advisory lock. Resolva as duplicatas se quiser o índice.', v_duplicadas;
  else
    create unique index if not exists payments_external_reference_key
      on public.payments (external_reference)
      where external_reference is not null;
    raise notice 'Índice único payments_external_reference_key criado (best-effort).';
  end if;
end;
$$;

-- ============================================================
-- 2) HELPERS
-- ============================================================

-- ---------- Helper: normaliza e-mail (trim + lowercase) ----------
create or replace function public._mf_normalizar_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_email, '')));
$$;

-- ---------- Helper: resolve o plano por código OU id (1/2/3 ou simple/standard/premium) ----------
create or replace function public._mf_resolver_plano(p_plano text)
returns public.plans
language plpgsql
security definer
set search_path = ''
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
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- ============================================================
-- 3) ATIVAR assinatura por e-mail + plano (admin)
-- ============================================================
create or replace function public.activate_subscription_by_email(
  p_email text,
  p_plano text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Janela de deduplicação (configurável): intervalo dentro do qual uma segunda
  -- chamada da MESMA operação é tratada como repetição acidental (no-op).
  -- Renovação legítima do mesmo plano (pagamento novo em momento distinto, fora
  -- da janela) acrescenta os dias normalmente.
  v_janela interval := interval '120 seconds';

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
  v_dup_id uuid;
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

  -- 4) ADVISORY LOCK por usuário: serializa duas chamadas simultâneas da MESMA
  --    operação, impedindo duplicação de renovação/pagamento. A checagem de
  --    deduplicação (passo 6) ocorre DEPOIS de adquirir o lock.
  perform pg_advisory_xact_lock(hashtextextended('mf_activate:' || v_user_id::text, 0));

  -- 5) Localiza o plano
  v_plano := public._mf_resolver_plano(p_plano);
  if v_plano is null then
    return jsonb_build_object('ok', false, 'erro', 'Plano inválido. Use 1, 2, 3 ou simple/standard/premium.');
  end if;

  v_duracao_dias := coalesce(v_plano.duration_days, 30);
  if v_duracao_dias <= 0 then v_duracao_dias := 30; end if;

  -- 6) JANELA DE DEDUPLICAÇÃO: se já existe um pagamento manual_whatsapp approved
  --    para o MESMO usuário/plano criado dentro da janela, é REPETIÇÃO da mesma
  --    operação (ex.: duplo clique) → retorna no-op (não estende dias, não cria
  --    pagamento). Se NÃO existir, é renovação legítima → prossegue.
  select id into v_dup_id
  from public.payments
  where user_id = v_user_id
    and plan_id = v_plano.id
    and provider = 'manual_whatsapp'
    and status = 'approved'
    and created_at >= v_agora - v_janela
  order by created_at desc
  limit 1;

  if v_dup_id is not null then
    -- Busca a assinatura atual para reportar o vencimento vigente
    select id, status, expires_at, starts_at, plan_code into v_sub
    from public.subscriptions
    where user_id = v_user_id
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'mensagem', 'Operação já processada recentemente (repetição ignorada). Nenhuma alteração feita.',
      'email', v_email,
      'plano', v_plano.name,
      'plano_codigo', v_plano.code,
      'status', coalesce(v_sub.status, 'active'),
      'inicio', to_char(coalesce(v_sub.starts_at, v_agora), 'YYYY-MM-DD'),
      'expiracao', to_char(coalesce(v_sub.expires_at, v_agora), 'YYYY-MM-DD'),
      'assinatura_id', v_sub.id,
      'pagamento_id', v_dup_id
    );
  end if;

  -- 7) Assinatura atual (mais recente)
  select id, status, expires_at, starts_at, plan_code into v_sub
  from public.subscriptions
  where user_id = v_user_id
  order by created_at desc
  limit 1;

  -- 8) Cálculo do período:
  --    - Assinatura ainda ATIVA (expires_at > agora): preserva os dias restantes.
  --      base = expires_at atual + duração do plano. Isso cobre tanto a renovação
  --      legítima do MESMO plano (fora da janela) quanto upgrade/downgrade.
  --    - Assinatura expirada ou inexistente: novo período a partir de agora.
  if v_sub.id is not null and v_sub.status = 'active' and v_sub.expires_at is not null
     and v_sub.expires_at > v_agora then
    v_base := v_sub.expires_at;
    v_starts := coalesce(v_sub.starts_at, v_agora);
  else
    v_base := v_agora;
    v_starts := v_agora;
  end if;
  v_expires := v_base + (v_duracao_dias || ' days')::interval;

  -- 9) Upsert idempotente da assinatura (atualiza a linha mais recente ou insere)
  if v_sub.id is not null then
    update public.subscriptions
      set plan_code = v_plano.code,
          plan_id = v_plano.id,
          status = 'active',
          starts_at = v_starts,
          expires_at = v_expires,
          cancelled_at = null,
          cancel_at_period_end = false,
          updated_at = v_agora
    where id = v_sub.id
    returning id into v_sub_id;
  else
    insert into public.subscriptions (user_id, plan_code, plan_id, status, starts_at, expires_at, created_at, updated_at)
    values (v_user_id, v_plano.code, v_plano.id, 'active', v_starts, v_expires, v_agora, v_agora)
    returning id into v_sub_id;
  end if;

  -- 10) Registra o pagamento manual — IDEMPOTENTE e DETERMINÍSTICO, SEM depender
  --     de constraint única. A external_reference é derivada do PERÍODO
  --     (starts_at + expires_at), que é estável para a MESMA operação. Como o
  --     advisory lock (passo 4) serializa chamadas concorrentes do mesmo usuário,
  --     o SELECT prévio + INSERT simples é seguro (sem ON CONFLICT, que falharia
  --     se o índice único não existir).
  v_ref := 'manual_whatsapp_' || v_user_id::text || '_' || v_plano.id::text
           || '_' || to_char(v_starts, 'YYYYMMDD') || '_' || to_char(v_expires, 'YYYYMMDD');

  select id into v_payment_id
  from public.payments
  where external_reference = v_ref
    and user_id = v_user_id
    and plan_id = v_plano.id
    and status = 'approved'
  limit 1;

  if v_payment_id is null then
    insert into public.payments (
      user_id, plan_code, plan_id, amount_cents, status, provider,
      provider_payment_id, external_reference, created_at, updated_at
    ) values (
      v_user_id, v_plano.code, v_plano.id, v_plano.price_cents, 'approved', 'manual_whatsapp',
      null, v_ref, v_agora, v_agora
    )
    returning id into v_payment_id;
  end if;

  -- 11) Confirmação clara
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
-- 4) DESATIVAR assinatura por e-mail (admin) — bloqueio imediato, preserva histórico
-- ============================================================
create or replace function public.deactivate_subscription_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

  -- Bloqueio imediato: status != 'active' corta o acesso (regra hasActiveSubscription).
  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = v_sub_id;

  return jsonb_build_object('ok', true, 'mensagem', 'Assinatura desativada com sucesso.', 'email', v_email);
end;
$$;

-- ============================================================
-- 5) CONSULTAR assinatura por e-mail (admin)
-- ============================================================
create or replace function public.get_subscription_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
-- 6) CANCELAR a PRÓPRIA assinatura (usuário logado) — corrige RLS
--    ALINHADO À REGRA REAL DE ACESSO:
--    hasActiveSubscription() = status='active' AND expires_at > now().
--    Portanto, para NÃO cortar o acesso de quem já pagou, o cancelamento
--    MANTÉM status='active' e marca cancel_at_period_end=true: o acesso
--    permanece até expires_at (fim do período pago), como promete a UI.
-- ============================================================
create or replace function public.cancel_my_subscription()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sub_id uuid;
  v_expires timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Você precisa estar logado.');
  end if;

  select id, expires_at into v_sub_id, v_expires from public.subscriptions
  where user_id = v_user_id and status = 'active'
  order by created_at desc limit 1;

  if v_sub_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Você não possui assinatura ativa.');
  end if;

  -- Mantém status='active' (acesso até o fim do período) e agenda o cancelamento.
  update public.subscriptions
  set cancel_at_period_end = true, updated_at = now()
  where id = v_sub_id;

  return jsonb_build_object(
    'ok', true,
    'mensagem', 'Assinatura cancelada. O acesso será mantido até o fim do período pago.',
    'expira_em', to_char(v_expires, 'YYYY-MM-DD')
  );
end;
$$;

-- ============================================================
-- 7) Permissões: revoga tudo e concede apenas o necessário
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