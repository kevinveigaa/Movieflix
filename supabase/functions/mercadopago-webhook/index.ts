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

      const expires = new Date();
      expires.setDate(expires.getDate() + 30);

      await supabase
        .from('subscriptions')
        .upsert({
          user_id: payment.user_id,
          plan_code: payment.plan_code,
          payment_id: payment.id,
          status: 'active',
          starts_at: new Date().toISOString(),
          expires_at: expires.toISOString(),
        });
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
