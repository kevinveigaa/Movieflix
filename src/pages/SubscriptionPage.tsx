import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Crown, CreditCard, Loader2, Clock, CheckCircle2, ArrowUpCircle, ArrowDownCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { createPixPayment, pollPaymentStatus } from '@/lib/mercadopago';
import { PixModal } from '@/components/PixModal';
import type { Plan, Payment } from '@/types';
import { entitlementHighlights, resolveSubscriptionPlan, diasRestantes, formatarVencimento, avisoVencimento } from '@/lib/plans';

export function SubscriptionPage() {
  const { user, subscription, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_cents', { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
    retry: 1,
  });

  const [pixOpen, setPixOpen] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [qrBase64, setQrBase64] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = hasActiveSubscription(subscription);
  const currentPlan = active ? resolveSubscriptionPlan(subscription, plans.data) : undefined;
  const currentPrice = currentPlan?.price_cents ?? 0;
  const dias = diasRestantes(subscription?.expires_at);
  const venc = formatarVencimento(subscription?.expires_at);
  const aviso = avisoVencimento(subscription?.expires_at);

  function planAction(plan: Plan) {
    if (!active) return { label: 'Assinar', disabled: false, kind: 'new' as const };
    if (currentPlan && plan.id === currentPlan.id) {
      return { label: 'Plano atual', disabled: true, kind: 'current' as const };
    }
    if (plan.price_cents > currentPrice) {
      return { label: 'Fazer upgrade', disabled: false, kind: 'upgrade' as const };
    }
    return { label: 'Trocar para este plano', disabled: false, kind: 'downgrade' as const };
  }

  async function subscribe(plan: Plan) {
    setError('');
    if (!user) {
      navigate('/login');
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
      setError((err as Error).message ?? 'Não foi possível gerar o pagamento.');
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
        <span className="chip border-roxo-600/40 bg-roxo-600/15 text-roxo-300">
          <Crown className="h-3.5 w-3.5" /> Assinatura MovieFlix
        </span>
        <h1 className="mt-4 font-display text-4xl tracking-wide text-white sm:text-5xl">
          <span className="text-gradient-strong">Escolha o seu plano</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-300">
          Assinatura mensal. Cancele quando quiser. Pagamento via Pix com confirmação automática.
        </p>
      </div>

      {active && subscription && (
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 font-semibold text-white">Sua assinatura está ativa</p>
          <p className="mt-1 text-sm text-ink-300">
            Plano: <span className="font-semibold text-white">{currentPlan?.name ?? 'Ativo'}</span>
            {subscription.expires_at && ` • Válido até ${new Date(subscription.expires_at).toLocaleDateString('pt-BR')}`}
          </p>
          {/* Dias restantes (cálculo real por UTC) */}
          <p className="mt-2 text-sm font-semibold text-emerald-300">
            {dias > 0 ? `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'} · Vencimento: ${venc}` : 'Assinatura expirada'}
          </p>
          {/* Aviso automático de vencimento próximo (5/3/1 dia) */}
          {aviso.mensagem && (
            <div className={`mx-auto mt-4 flex max-w-lg items-start gap-2 rounded-xl border px-4 py-3 text-left text-xs font-medium ${
              aviso.nivel === '1'
                ? 'border-red-500/40 bg-red-500/10 text-red-200'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            }`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{aviso.mensagem}</span>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-400">
            Quer mais qualidade e telas? Escolha um plano superior abaixo para fazer upgrade quando quiser.
          </p>
        </div>
      )}

      {/* Sem assinatura ativa: aviso claro */}
      {!active && subscription && (
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 font-semibold text-white">Assinatura expirada</p>
          <p className="mt-1 text-sm text-ink-300">
            {subscription.expires_at
              ? `Seu plano venceu em ${formatarVencimento(subscription.expires_at)}. Renove abaixo para voltar a assistir.`
              : 'Você não possui uma assinatura ativa. Escolha um plano abaixo para começar.'}
          </p>
        </div>
      )}

      {error && (
        <div className="mx-auto mt-6 max-w-xl rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Falha temporária ao consultar planos: nunca trava a página */}
      {plans.isError && (
        <div className="mx-auto mt-6 max-w-xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Não foi possível carregar os planos. Verifique sua conexão e tente novamente.
          <button
            onClick={() => plans.refetch()}
            className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-100 underline hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {plans.isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-96 rounded-2xl" />
            ))
          : plans.data?.map((plan) => {
              const featured = plan.code === 'standard';
              const isCurrent = !!currentPlan && plan.id === currentPlan.id;
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-6 transition ${
                    featured
                      ? 'border-roxo-500/60 bg-gradient-to-b from-roxo-900/40 to-ink-900 shadow-xl shadow-roxo-900/30'
                      : 'border-white/10 bg-ink-900/70'
                  } ${isCurrent ? 'ring-2 ring-emerald-500/60' : ''}`}
                >
                  {isCurrent && (
                    <span className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Seu plano
                    </span>
                  )}
                  {featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600 to-roxo-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
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
                    {[...entitlementHighlights(plan), ...(plan.features ?? [])].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-ink-200">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-roxo-500" /> {f}
                      </li>
                    ))}
                  </ul>
                  {(() => {
                    const action = planAction(plan);
                    return (
                      <>
                        {action.kind === 'upgrade' && (
                          <p className="mt-5 text-xs text-roxo-300">
                            Você paga apenas a diferença na próxima cobrança e o upgrade vale na hora.
                          </p>
                        )}
                        <button
                          onClick={() => subscribe(plan)}
                          disabled={busy || action.disabled}
                          className={
                            (action.kind === 'upgrade' || featured ? 'btn-primary' : 'btn-outline') + ' mt-6 w-full'
                          }
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : action.kind === 'upgrade' ? (
                            <ArrowUpCircle className="h-4 w-4" />
                          ) : action.kind === 'downgrade' ? (
                            <ArrowDownCircle className="h-4 w-4" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          {action.label}
                        </button>
                      </>
                    );
                  })()}
                </div>
              );
            })}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-ink-900/50 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <Clock className="h-5 w-5 text-roxo-400" /> Como funciona o pagamento
        </h3>
        <ol className="mt-3 space-y-2 text-sm text-ink-300">
          <li>1. Escolha um plano e clique em Assinar.</li>
          <li>2. Geramos um pagamento Pix com QR Code e o código Copia e Cola.</li>
          <li>3. Pague no app do seu banco e a confirmação é automática.</li>
          <li>4. Sua assinatura é liberada na hora.</li>
          <li>5. Já é assinante? Você pode trocar de plano (upgrade ou downgrade) a qualquer momento.</li>
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




