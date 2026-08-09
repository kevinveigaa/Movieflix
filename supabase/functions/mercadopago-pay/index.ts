import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface PayBody {
  planId: string;
  amount: number;
  description: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'NÃ£o autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as PayBody;
    if (!body.planId || !body.amount) {
      return new Response(JSON.stringify({ error: 'Dados invÃ¡lidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: plan } = await admin.from('plans').select('*').eq('id', body.planId).maybeSingle();
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plano nÃ£o encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Mercado Pago nÃ£o configurado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const externalRef = crypto.randomUUID();
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': externalRef,
      },
      body: JSON.stringify({
        transaction_amount: plan.price_cents / 100,
        description: `MovieFlix - ${plan.name}`,
        payment_method_id: 'pix',
        payer: { email: user.email },
        external_reference: externalRef,
        notification_url: "https://mntyanfhxiqspdedmddb.supabase.co/functions/v1/mercadopago-webhook",
        metadata: { user_id: user.id, plan_code: plan.code, plan_id: plan.id, payment_ref: externalRef },
      }),
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      return new Response(
        JSON.stringify({ error: `Erro Mercado Pago: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const mpData = await mpRes.json();
    const qr = mpData.point_of_interaction?.transaction_data;
    const qrCode = qr?.qr_code ?? '';
    const qrBase64 = qr?.qr_code_base64 ?? '';

    const { data: payment, error: payErr } = await admin
      .from('payments')
      .insert({
        user_id: user.id,
        plan_code: plan.code,
        plan_id: plan.id,
        amount: plan.price_cents,
        status: 'pending',
        payment_id: String(mpData.id),
        qr_code: qrCode,
        qr_code_base64: qrBase64,
      })
      .select()
      .maybeSingle();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: '$($payErr?.message)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        payment,
        qr_code: qrCode,
        qr_base64: qrBase64,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});


