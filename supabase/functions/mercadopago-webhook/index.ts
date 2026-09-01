import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

// Log estruturado (sem dados sensíveis: nunca loga token, chave ou email).
function log(...args: unknown[]) {
  console.log('[mercadopago-webhook]', ...args);
}
function logError(...args: unknown[]) {
  console.error('[mercadopago-webhook]', ...args);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');

    if (!serviceRole || !supabaseUrl || !token) {
      logError('Configuração ausente: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL ou MERCADO_PAGO_ACCESS_TOKEN não definidos.');
      return new Response(JSON.stringify({ error: 'Configuração ausente no servidor' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRole);

    const body = await req.json();
    const paymentId = String(body?.data?.id ?? body?.id ?? '');

    if (!paymentId) {
      log('Notificação sem payment id (ignorada).');
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Consulta o pagamento na API do Mercado Pago (fonte da verdade).
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mpRes.ok) {
      const txt = await mpRes.text();
      logError('Falha ao consultar pagamento no MP:', mpRes.status, txt.slice(0, 200));
      return new Response(JSON.stringify({ error: 'Falha ao consultar pagamento' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const mp = await mpRes.json();

    const status = mp.status;
    const mapped = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';

    // ---- 1) Atualiza o pagamento na tabela `payments` ----
    // Guarda de idempotência: se o pagamento JÁ está 'approved' e esta
    // notificação também é 'approved', significa que o webhook já processou
    // este pagamento antes (evento duplicado). NÃO renovamos a assinatura de
    // novo — apenas confirmamos e retornamos, evitando adicionar dias duas vezes.
    const { data: antes } = await supabase
      .from('payments')
      .select('status')
      .eq('provider_payment_id', paymentId)
      .maybeSingle();

    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .update({ status: mapped, updated_at: new Date().toISOString() })
      .eq('provider_payment_id', paymentId)
      .select()
      .maybeSingle();

    if (payErr) {
      logError('Erro ao atualizar payments:', payErr.message);
      return new Response(JSON.stringify({ error: 'Falha ao atualizar pagamento' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Evento duplicado já processado: não re-ativa nem estende dias de novo.
    if (mapped === 'approved' && antes?.status === 'approved') {
      log('Webhook duplicado (pagamento já aprovado) — ignorado para evitar dias extras.');
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: se não achou por provider_payment_id, tenta por external_reference
    // (metadata) e depois pelo id legado `payment_id`.
    let payment = payment;
    if (!payment) {
      const extRef = mp.external_reference;
      if (extRef) {
        const { data: byRef } = await supabase
          .from('payments')
          .update({ status: mapped, updated_at: new Date().toISOString() })
          .eq('external_reference', extRef)
          .select()
          .maybeSingle();
        payment = byRef;
      }
    }
    if (!payment) {
      const { data: byLegacy } = await supabase
        .from('payments')
        .update({ status: mapped, updated_at: new Date().toISOString() })
        .eq('payment_id', paymentId)
        .select()
        .maybeSingle();
      payment = byLegacy;
    }

    // Se ainda não achou o pagamento, tenta criar a assinatura a partir do
    // metadata do próprio pagamento do MP (fallback para pagamentos criados
    // antes da migration canônica).
    if (!payment && mapped === 'approved') {
      const meta = mp.metadata ?? {};
      const userId = meta.user_id;
      const planCode = meta.plan_code;
      const planId = meta.plan_id;
      if (userId && planCode) {
        log('Pagamento aprovado sem registro local; criando assinatura via metadata.');
        const { data: plan } = await supabase
          .from('plans')
          .select('id, code, duration_days')
          .eq('code', planCode)
          .maybeSingle();
        const duracaoDias = plan?.duration_days && Number(plan.duration_days) > 0 ? Number(plan.duration_days) : 30;
        const agora = new Date();
        const expires = new Date(agora.getTime());
        expires.setDate(expires.getDate() + duracaoDias);
        await supabase.from('subscriptions').insert({
          user_id: userId,
          plan_code: planCode,
          plan_id: plan?.id ?? planId ?? null,
          status: 'active',
          starts_at: agora.toISOString(),
          expires_at: expires.toISOString(),
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (mapped === 'approved' && payment) {
      // ---2) Duração do plano (fallback 30 dias) ---
      const { data: plan } = await supabase
        .from('plans')
        .select('id, code, duration_days')
        .eq('code', payment.plan_code)
        .maybeSingle();
      const duracaoDias = plan?.duration_days && Number(plan.duration_days) > 0 ? Number(plan.duration_days) : 30;

      const agora = new Date();

      // ---3) Assinatura atual do usuário (a mais recente) ---
      const { data: atual } = await supabase
        .from('subscriptions')
        .select('id, status, expires_at, starts_at')
        .eq('user_id', payment.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const ativaAinda =
        atual &&
        atual.status === 'active' &&
        atual.expires_at &&
        new Date(atual.expires_at).getTime() > agora.getTime();

      // Renovação antecipada: estende a partir do vencimento atual (não sobrescreve).
      const base = ativaAinda && atual.expires_at ? new Date(atual.expires_at) : agora;
      const expires = new Date(base.getTime());
      expires.setDate(expires.getDate() + duracaoDias);

      const startsAt = ativaAinda && atual.starts_at ? atual.starts_at : agora.toISOString();

      const assinatura = {
        user_id: payment.user_id,
        plan_code: payment.plan_code,
        plan_id: plan?.id ?? payment.plan_id ?? null,
        payment_id: payment.id,
        status: 'active',
        starts_at: startsAt,
        expires_at: expires.toISOString(),
      };

      // ---4) Upsert idempotente: atualiza a linha mais recente ou insere ---
      const alvo = atual && atual.id ? atual.id : null;
      if (alvo) {
        const { error: updErr } = await supabase.from('subscriptions').update(assinatura).eq('id', alvo);
        if (updErr) {
          logError('Erro ao atualizar assinatura:', updErr.message);
          return new Response(JSON.stringify({ error: 'Falha ao ativar assinatura' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        const { error: insErr } = await supabase.from('subscriptions').insert(assinatura);
        if (insErr) {
          logError('Erro ao criar assinatura:', insErr.message);
          return new Response(JSON.stringify({ error: 'Falha ao criar assinatura' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      log('Assinatura ativada para usuário', payment.user_id, 'plano', payment.plan_code, 'vence', expires.toISOString());
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logError('Erro inesperado:', (err as Error).message);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});