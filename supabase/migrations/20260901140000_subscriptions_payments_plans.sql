-- ============================================================
-- MovieFlix — Assinaturas, Pagamentos e Planos (schema canônico)
-- Idempotente: pode ser aplicado mesmo se as tabelas já existirem
-- (criadas manualmente no dashboard). Adiciona colunas faltantes,
-- faz backfill e garante RLS + seed dos planos.
-- ============================================================

-- ---------- PLANS ----------
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  description text DEFAULT '',
  features jsonb DEFAULT '[]'::jsonb,
  duration_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed dos planos (só se a tabela estiver vazia)
INSERT INTO public.plans (code, name, price_cents, description, features, duration_days)
SELECT * FROM (VALUES
  ('simple', 'Plano 1', 1990, 'Qualidade HD, 1 tela', '["HD (720p)","1 tela simultânea","Catálogo completo"]'::jsonb, 30),
  ('standard', 'Plano 2', 2990, 'Qualidade Full HD, 2 telas', '["Full HD (1080p)","2 telas simultâneas","5 downloads/mês"]'::jsonb, 30),
  ('premium', 'Plano 3', 3990, 'Qualidade 4K, 4 telas', '["4K + HDR","4 telas simultâneas","Downloads ilimitados"]'::jsonb, 30)
) AS v(code, name, price_cents, description, features, duration_days)
WHERE NOT EXISTS (SELECT 1 FROM public.plans);

-- ---------- PAYMENTS ----------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text,
  plan_id uuid,
  amount_cents numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text,
  external_reference text,
  pix_code text,
  pix_qr_base64 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill/aliases para bancos antigos que usavam nomes diferentes
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_cents numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS external_reference text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS pix_code text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS pix_qr_base64 text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS plan_id uuid;

-- Copia dados de colunas legadas (se existirem) para as canônicas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='payment_id') THEN
    UPDATE public.payments SET provider_payment_id = payment_id WHERE provider_payment_id IS NULL AND payment_id IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='qr_code') THEN
    UPDATE public.payments SET pix_code = qr_code WHERE pix_code IS NULL AND qr_code IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='qr_code_base64') THEN
    UPDATE public.payments SET pix_qr_base64 = qr_code_base64 WHERE pix_qr_base64 IS NULL AND qr_code_base64 IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='amount') THEN
    UPDATE public.payments SET amount_cents = amount WHERE amount_cents = 0 AND amount IS NOT NULL;
  END IF;
END $$;

-- ---------- SUBSCRIPTIONS ----------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text,
  plan_id uuid,
  payment_id uuid,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_id uuid;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_id uuid;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON public.payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_external_ref ON public.payments(external_reference);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_created ON public.subscriptions(user_id, created_at DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- plans: leitura pública (catálogo de planos), escrita só via service role
DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT USING (true);

-- payments: usuário lê apenas os próprios pagamentos; escrita via service role
DROP POLICY IF EXISTS "payments_own_read" ON public.payments;
CREATE POLICY "payments_own_read" ON public.payments FOR SELECT USING (auth.uid() = user_id);

-- subscriptions: usuário lê apenas a própria assinatura; escrita via service role
DROP POLICY IF EXISTS "subscriptions_own_read" ON public.subscriptions;
CREATE POLICY "subscriptions_own_read" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);