import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Crown, CreditCard, Loader2, Clock, XCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { createPixPayment, pollPaymentStatus } from '@/lib/mercadopago';
import { PixModal } from '@/components/PixModal';
import type { Plan, Payment } from '@/types';

export function SubscriptionPage() {
  const { user, subscription, refreshSubscription } = useAuth();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_cents', { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const [pixOpen, setPixOpen] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [qrBase64, setQrBase64] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = hasActiveSubscription(subscription);

  async function subscribe(plan: Plan) {
    setError('');
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    try {
      const res = await createPixPayment(plan);
      setCurrentPayment(res.payment);
      setQrCode(res.qr_code);
      setQrBase64(res.qr_base64);
      setPixOpen(true);
      startPolling(res.payment.id);
    } catch (err) {
      setError((err as Error).message ?? 'No foi possvel gerar o pagamento.');
    } finally {
      setBusy(false);
    }
  }

  function startPolling(paymentId: string) {
    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start > 1000 * 60 * 15) {
        clearInterval(interval);
        return;
      }
      const p = await pollPaymentStatus(paymentId);
      if (p && p.status === 'approved') {
        clearInterval(interval);
        setCurrentPayment(p);
        await refreshSubscription();
        setTimeout(() => {
          setPixOpen(false);
        }, 2500);
      } else if (p && (p.status === 'rejected' || p.status === 'cancelled')) {
        clearInterval(interval);
        setCurrentPayment(p);
      }
    }, 4000);
  }

  return (
    <div className="container-app py-10">
      <div className="text-center">
        <span className="chip border-brand-600/40 bg-brand-600/15 text-brand-300">
          <Crown className="h-3.5 w-3.5" /> Assinatura MovieFlix
        </span>
        <h1 className="mt-4 font-display text-4xl tracking-wide text-white sm:text-5xl">Escolha o seu plano</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-300">
          Assinatura mensal. Cancele quando quiser. Pagamento via Pix com confirmao automtica.
        </p>
      </div>

      {active && subscription && (
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 font-semibold text-white">Sua assinatura est ativa</p>
          <p className="mt-1 text-sm text-ink-300">
            Plano: <span className="font-semibold text-white">{subscription.plan?.name ?? 'Ativo'}</span>
            {subscription.expires_at && `  Vlido at ${new Date(subscription.expires_at).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
      )}

      {error && (
        <div className="mx-auto mt-6 max-w-xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {plans.isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-96 rounded-2xl" />
            ))
          : plans.data?.map((plan) => {
              const featured = plan.code === 'standard';
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-6 transition ${
                    featured
                      ? 'border-brand-600/50 bg-gradient-to-b from-brand-900/30 to-ink-900 shadow-xl shadow-brand-900/20'
                      : 'border-white/10 bg-ink-900/70'
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Mais popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <p className="mt-1 text-sm text-ink-400">{plan.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-display text-4xl text-white">R$ {(plan.price_cents / 100).toFixed(2).replace('.', ',')}</span>
                    <span className="text-sm text-ink-400">/ms</span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-ink-200">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => subscribe(plan)}
                    disabled={busy || active}
                    className={featured ? 'btn-primary mt-6 w-full' : 'btn-outline mt-6 w-full'}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {active ? 'Plano ativo' : 'Assinar'}
                  </button>
                </div>
              );
            })}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-ink-900/50 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <Clock className="h-5 w-5 text-brand-400" /> Como funciona o pagamento
        </h3>
        <ol className="mt-3 space-y-2 text-sm text-ink-300">
          <li>1. Escolha um plano e clique em Assinar.</li>
          <li>2. Geramos um pagamento Pix com QR Code e o cdigo Copia e Cola.</li>
          <li>3. Pague no app do seu banco e a confirmao  automtica.</li>
          <li>4. Sua assinatura  liberada na hora.</li>
        </ol>
      </div>

      <PixModal
        open={pixOpen}
        onClose={() => setPixOpen(false)}
        qrCode={qrCode}
        qrBase64={qrBase64}
        payment={currentPayment}
      />
    </div>
  );
}




