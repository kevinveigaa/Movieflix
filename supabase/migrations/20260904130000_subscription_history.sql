-- ============================================================
-- MovieFlix — HISTÓRICO DE ALTERAÇÕES DE ASSINATURA
--
-- Cria a tabela `subscription_history` para registrar TODAS as
-- operações de assinatura feitas pelo admin (ativação, reativação,
-- troca de plano, adição/remoção de dias, desativação). Não cria
-- estrutura paralela de assinatura — apenas um log de auditoria.
--
-- Colunas:
--   id, subscription_id, admin_id, acao, plano_anterior, plano_novo,
--   vencimento_anterior, vencimento_novo, dias_adicionados,
--   dias_removidos, created_at
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid,
  admin_id uuid,
  acao text NOT NULL,
  plano_anterior text,
  plano_novo text,
  vencimento_anterior timestamptz,
  vencimento_novo timestamptz,
  dias_adicionados integer,
  dias_removidos integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_history_sub
  ON public.subscription_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_created
  ON public.subscription_history(created_at DESC);

-- RLS: somente leitura para o dono da assinatura (via service role no backend).
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_history_own_read" ON public.subscription_history;
CREATE POLICY "subscription_history_own_read"
  ON public.subscription_history
  FOR SELECT
  USING (auth.uid() = admin_id OR auth.uid() IN (
    SELECT user_id FROM public.subscriptions WHERE id = subscription_id
  ));

-- Helper: registra uma operação no histórico (usado pelo backend via service role).
CREATE OR REPLACE FUNCTION public._mf_registrar_historico(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_acao text,
  p_plano_anterior text,
  p_plano_novo text,
  p_vencimento_anterior timestamptz,
  p_vencimento_novo timestamptz,
  p_dias_adicionados integer,
  p_dias_removidos integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.subscription_history (
    subscription_id, admin_id, acao, plano_anterior, plano_novo,
    vencimento_anterior, vencimento_novo, dias_adicionados, dias_removidos
  ) VALUES (
    p_subscription_id, p_admin_id, p_acao, p_plano_anterior, p_plano_novo,
    p_vencimento_anterior, p_vencimento_novo, p_dias_adicionados, p_dias_removidos
  );
$$;

REVOKE ALL ON FUNCTION public._mf_registrar_historico(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public._mf_registrar_historico(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';