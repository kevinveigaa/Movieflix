-- ============================================================
-- MovieFlix — CORREÇÃO DEFINITIVA: payments.amount NULL
--
-- ERRO CRÍTICO: "null value in column \"amount\" of relation \"payments\"
-- violates not-null constraint".
--
-- CAUSA RAIZ: a tabela `payments` em produção tem uma coluna `amount`
-- (numeric NOT NULL) — schema legado — mas a função
-- `activate_subscription_by_email` inseria apenas `amount_cents`, deixando
-- `amount` NULL → violava a constraint e a ativação falhava.
--
-- CORREÇÃO (não destrutiva, sem DROP NOT NULL, sem apagar dados):
--  1. Garante a coluna `amount` (se faltar) e faz backfill a partir de
--     `amount_cents` (e vice-versa), normalizando amount/amount_cents/price.
--  2. Reescreve `activate_subscription_by_email` para:
--       * validar que o plano tem price_cents > 0 ANTES de inserir;
--       * preencher SEMPRE `amount` E `amount_cents` com o valor do plano;
--       * se o plano não tiver preço válido → NÃO cria payment, retorna erro
--         controlado (sem NULL, sem quebrar a interface).
--  3. Mantém os 3 planos (Plano 1=1990, Plano 2=2990, Plano 3=3990) intactos.
-- ============================================================

-- ---------- 1) Garantir coluna `amount` + backfill ----------
-- Se a coluna `amount` não existir, cria (nullable primeiro para backfill).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments' AND column_name='amount'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN amount numeric;
  END IF;
END $$;

-- Backfill: amount <- amount_cents (quando amount é NULL e amount_cents tem valor)
UPDATE public.payments
SET amount = amount_cents
WHERE amount IS NULL AND amount_cents IS NOT NULL;

-- Backfill reverso: amount_cents <- amount (quando amount_cents é 0/NULL e amount tem valor)
UPDATE public.payments
SET amount_cents = amount
WHERE (amount_cents IS NULL OR amount_cents = 0) AND amount IS NOT NULL;

-- Se ainda houver NULL em amount (linhas sem valor), preenche com 0 para
-- satisfazer a constraint NOT NULL sem perder o histórico.
UPDATE public.payments SET amount = 0 WHERE amount IS NULL;

-- Garante NOT NULL em amount (a coluna já existia com NOT NULL em produção;
-- aqui apenas reforça para bancos onde foi criada sem constraint).
ALTER TABLE public.payments ALTER COLUMN amount SET NOT NULL;

-- ---------- 2) Reescrever activate_subscription_by_email ----------
-- A função agora preenche `amount` E `amount_cents` com o price_cents do
-- plano, e valida o preço antes de inserir (nunca insere NULL).
CREATE OR REPLACE FUNCTION public.activate_subscription_by_email(
  p_email text,
  p_plano text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_janela interval := interval '120 seconds';
  v_email text := public._mf_normalizar_email(p_email);
  v_user_id uuid;
  v_plano public.plans;
  v_duracao_dias integer;
  v_preco numeric;
  v_agora timestamptz := now();
  v_base timestamptz;
  v_expires timestamptz;
  v_starts timestamptz;
  v_sub_id uuid;
  v_sub record;
  v_payment_id uuid;
  v_ref text;
  v_dup_id uuid;
BEGIN
  -- 1) Só admin pode ativar
  IF NOT public._mf_eh_admin() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Acesso negado: apenas administradores podem ativar assinaturas.');
  END IF;

  -- 2) Valida e-mail
  IF v_email = '' OR v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Informe o e-mail do cliente.');
  END IF;

  -- 3) Localiza o usuário
  SELECT id INTO v_user_id FROM auth.users WHERE lower(btrim(email)) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum usuário encontrado com o e-mail informado.');
  END IF;

  -- 4) Advisory lock por usuário (serializa chamadas concorrentes)
  PERFORM pg_advisory_xact_lock(hashtextextended('mf_activate:' || v_user_id::text, 0));

  -- 5) Localiza o plano
  v_plano := public._mf_resolver_plano(p_plano);
  IF v_plano IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Plano inválido. Use 1, 2, 3 ou simple/standard/premium.');
  END IF;

  v_duracao_dias := coalesce(v_plano.duration_days, 30);
  IF v_duracao_dias <= 0 THEN v_duracao_dias := 30; END IF;

  -- 5.1) VALIDAÇÃO DO PREÇO (causa raiz do amount NULL):
  --      Se o plano não tiver um preço válido (> 0), NÃO cria pagamento,
  --      NÃO insere NULL, NÃO quebra a interface — retorna erro controlado.
  v_preco := coalesce(v_plano.price_cents, 0);
  IF v_preco IS NULL OR v_preco <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'O plano "' || v_plano.name || '" não possui um preço válido configurado. Corrija o preço do plano antes de ativar.'
    );
  END IF;

  -- 6) Janela de deduplicação
  SELECT id INTO v_dup_id
  FROM public.payments
  WHERE user_id = v_user_id
    AND plan_id = v_plano.id
    AND provider = 'manual_whatsapp'
    AND status = 'approved'
    AND created_at >= v_agora - v_janela
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    SELECT id, status, expires_at, starts_at, plan_code INTO v_sub
    FROM public.subscriptions
    WHERE user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
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
  END IF;

  -- 7) Assinatura atual
  SELECT id, status, expires_at, starts_at, plan_code INTO v_sub
  FROM public.subscriptions
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 8) Cálculo do período
  IF v_sub.id IS NOT NULL AND v_sub.status = 'active' AND v_sub.expires_at IS NOT NULL
     AND v_sub.expires_at > v_agora THEN
    v_base := v_sub.expires_at;
    v_starts := coalesce(v_sub.starts_at, v_agora);
  ELSE
    v_base := v_agora;
    v_starts := v_agora;
  END IF;
  v_expires := v_base + (v_duracao_dias || ' days')::interval;

  -- 9) Upsert da assinatura
  IF v_sub.id IS NOT NULL THEN
    UPDATE public.subscriptions
      SET plan_code = v_plano.code,
          plan_id = v_plano.id,
          status = 'active',
          starts_at = v_starts,
          expires_at = v_expires,
          cancelled_at = null,
          cancel_at_period_end = false,
          updated_at = v_agora
    WHERE id = v_sub.id
    RETURNING id INTO v_sub_id;
  ELSE
    INSERT INTO public.subscriptions (user_id, plan_code, plan_id, status, starts_at, expires_at, created_at, updated_at)
    VALUES (v_user_id, v_plano.code, v_plano.id, 'active', v_starts, v_expires, v_agora, v_agora)
    RETURNING id INTO v_sub_id;
  END IF;

  -- 10) Registra o pagamento manual — SEMPRE com amount E amount_cents = price_cents
  v_ref := 'manual_whatsapp_' || v_user_id::text || '_' || v_plano.id::text
           || '_' || to_char(v_starts, 'YYYYMMDD') || '_' || to_char(v_expires, 'YYYYMMDD');

  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE external_reference = v_ref
    AND user_id = v_user_id
    AND plan_id = v_plano.id
    AND status = 'approved'
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    INSERT INTO public.payments (
      user_id, plan_code, plan_id, amount, amount_cents, status, provider,
      provider_payment_id, external_reference, created_at, updated_at
    ) VALUES (
      v_user_id, v_plano.code, v_plano.id, v_preco, v_preco, 'approved', 'manual_whatsapp',
      null, v_ref, v_agora, v_agora
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 11) Confirmação
  RETURN jsonb_build_object(
    'ok', true,
    'mensagem', 'ATIVAÇÃO REALIZADA COM SUCESSO',
    'email', v_email,
    'plano', v_plano.name,
    'plano_codigo', v_plano.code,
    'valor', v_preco,
    'status', 'active',
    'inicio', to_char(v_starts, 'YYYY-MM-DD'),
    'expiracao', to_char(v_expires, 'YYYY-MM-DD'),
    'assinatura_id', v_sub_id,
    'pagamento_id', v_payment_id
  );
END;
$$;

-- Permissões (mantém o comportamento atual)
REVOKE ALL ON FUNCTION public.activate_subscription_by_email(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.activate_subscription_by_email(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';