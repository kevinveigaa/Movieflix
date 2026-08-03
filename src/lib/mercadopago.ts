import { supabase, SUPABASE_URL } from '@/lib/supabase';
import type { Plan, Payment } from '@/types';

export interface PixResponse {
  payment: Payment;
  qr_code: string;
  qr_base64: string;
}

export async function createPixPayment(plan: Plan): Promise<PixResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('Você precisa estar logado para assinar um plano.');

  const url = `${SUPABASE_URL}/functions/v1/mercadopago-pay`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ planId: plan.id, amount: plan.price_cents, description: plan.name }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Falha ao gerar pagamento (${res.status}): ${msg}`);
  }
  const data = await res.json();
  if (!data.qr_code) throw new Error('Resposta inválida do servidor de pagamento.');
  return data as PixResponse;
}

export async function pollPaymentStatus(paymentId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle();
  if (error) return null;
  return data as Payment | null;
}
