import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();

    const paymentId = String(
      body?.data?.id ??
      body?.id ??
      ''
    );

    if (!paymentId) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')!;

    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const mp = await mpRes.json();

    const status = mp.status;

    const mapped =
      status === 'approved'
        ? 'approved'
        : status === 'rejected'
        ? 'rejected'
        : 'pending';

    const { data: payment } = await supabase
      .from('payments')
      .update({
        status: mapped,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .select()
      .maybeSingle();

    if (mapped === 'approved' && payment) {
      // ── RENOVAÇÃO/COMPRA: preserva dias restantes se a assinatura ainda
      //    estiver ativa. Regra (pedido do dono):
      //      * Assinatura ativa (não expirada) → novaData = dataAtualDeVencimento
      //        + duraçãoDoNovoPlano (ex.: 5 dias restantes + 30 = 35).
      //      * Expirada ou inexistente           → novaData = agora + duração.
      //    A duração vem da tabela `plans` (dias), com fallback de 30 dias.

      // Duração em dias do plano (coluna `duration_days` se existir, senão 30).
      const { data: plan } = await supabase
        .from('plans')
        .select('id, code, duration_days')
        .eq('code', payment.plan_code)
        .maybeSingle();
      const duracaoDias =
        plan && plan.duration_days && Number(plan.duration_days) > 0
          ? Number(plan.duration_days)
          : 30;

      const agora = new Date();

      // Assinatura atual do usuário (a mais recente).
      const { data: atual } = await supabase
        .from('subscriptions')
        .select('id, status, expires_at')
        .eq('user_id', payment.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const ativaAinda =
        atual &&
        atual.status === 'active' &&
        atual.expires_at &&
        new Date(atual.expires_at).getTime() > agora.getTime();

      // base = vencimento atual se ainda ativo; senão agora.
      const base = ativaAinda && atual.expires_at ? new Date(atual.expires_at) : agora;
      const expires = new Date(base.getTime());
      expires.setDate(expires.getDate() + duracaoDias);

      // starts_at: mantém o início original se ainda ativo (renovação estende
      // o período), ou usa agora para uma nova assinatura.
      const startsAt = ativaAinda && atual.starts_at ? atual.starts_at : agora.toISOString();

      // Upsert SEM duplicidade: se já existe linha para este usuário + plano,
      // atualiza (novo vencimento estendido); senão cria. A coluna `user_id`
      // precisa ter unique constraint — sem ela o upsert insere em vez de
      // atualizar (comportamento padrão do PostgREST). Para máxima segurança
      // contra duplicidade em bancos antigos, primeiro tentamos atualizar a
      // linha mais recente do usuário; se não existir, inserimos.
      const alvo = atual && atual.id ? atual.id : null;
      const assinatura = {
        user_id: payment.user_id,
        plan_code: payment.plan_code,
        plan_id: plan?.id ?? null,
        payment_id: payment.id,
        status: 'active',
        starts_at: startsAt,
        expires_at: expires.toISOString(),
      };

      if (alvo) {
        await supabase.from('subscriptions').update(assinatura).eq('id', alvo);
      } else {
        await supabase.from('subscriptions').insert(assinatura);
      }
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: String(err)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
