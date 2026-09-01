import { useQuery } from '@tanstack/react-query';
import { Check, Crown, MessageCircle, AlertTriangle, CheckCircle2, CalendarClock, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import type { Plan } from '@/types';
import { entitlementHighlights, resolveSubscriptionPlan, diasRestantes, formatarVencimento, avisoVencimento } from '@/lib/plans';
import { linkContratarPlano, linkRenovarPlano, linkSuporte, WHATSAPP_LABEL } from '@/lib/whatsapp';

/**
 * SubscriptionPage — ATIVAÇÃO MANUAL VIA WHATSAPP.
 *
 * O MovieFlix NÃO usa mais pagamento automático (Mercado Pago). O fluxo é:
 *   1. Usuário escolhe um plano.
 *   2. Clica em "CONTRATAR PELO WHATSAPP" → abre o WhatsApp do admin com a
 *      mensagem pré-preenchida (e-mail da conta + plano + valor).
 *   3. Admin recebe o pagamento manualmente e ativa a conta informando
 *      SOMENTE e-mail + plano (função activate_subscription_by_email).
 *   4. A assinatura passa a ATIVA imediatamente e o acesso é liberado.
 *
 * O frontend NUNCA ativa a assinatura sozinho — a ativação é feita no banco
 * (SECURITY DEFINER, só admin). Aqui mostramos o estado real e os botões.
 */

export function SubscriptionPage() {
  const { user, subscription } = useAuth();
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_cents', { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
    retry: 1,
  });

  const active = hasActiveSubscription(subscription);
  const currentPlan = active ? resolveSubscriptionPlan(subscription, plans.data) : undefined;
  const dias = diasRestantes(subscription?.expires_at);
  const venc = formatarVencimento(subscription?.expires_at);
  const aviso = avisoVencimento(subscription?.expires_at);
  const email = user?.email ?? '';

  const temAssinatura = !!subscription;
  const expirada = temAssinatura && !active;

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
          Assinatura mensal. Cancele quando quiser. Ativação manual via WhatsApp após a confirmação do pagamento.
        </p>
      </div>

      {/* ---- ASSINATURA ATIVA ---- */}
      {active && subscription && (
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 font-semibold text-white">Sua assinatura está ativa</p>
          <p className="mt-1 text-sm text-ink-300">
            Plano: <span className="font-semibold text-white">{currentPlan?.name ?? 'Ativo'}</span>
            {subscription.expires_at && ` • Válido até ${new Date(subscription.expires_at).toLocaleDateString('pt-BR')}`}
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald-300">
            {dias > 0 ? `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'} · Vencimento: ${venc}` : 'Assinatura expirada'}
          </p>
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

      {/* ---- ASSINATURA EXPIRADA ---- */}
      {expirada && (
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 font-semibold text-white">Assinatura expirada</p>
          <p className="mt-1 text-sm text-ink-300">
            {subscription?.expires_at
              ? `Seu plano venceu em ${formatarVencimento(subscription.expires_at)}. Renove abaixo para voltar a assistir.`
              : 'Sua assinatura não está mais ativa. Renove abaixo para voltar a assistir.'}
          </p>
          <a
            href={linkRenovarPlano({ email, planoNome: currentPlan?.name, planoCodigo: currentPlan?.code })}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-5 inline-flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" /> RENOVAR PELO WHATSAPP
          </a>
        </div>
      )}

      {/* ---- SEM ASSINATURA (aguardando ativação) ---- */}
      {!active && !expirada && (
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <Clock className="mx-auto h-8 w-8 text-amber-400" />
          <p className="mt-2 font-semibold text-white">Assinatura necessária</p>
          <p className="mt-1 text-sm text-ink-300">
            Seu cadastro foi realizado, mas sua assinatura ainda não está ativa. Escolha um plano abaixo e
            contrate via WhatsApp. Após a confirmação do pagamento, sua assinatura será ativada manualmente.
          </p>
        </div>
      )}

      {/* ---- Erro ao carregar planos ---- */}
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
                    <span className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
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
                    <span className="text-sm text-ink-400">/mês</span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {[...entitlementHighlights(plan), ...(plan.features ?? [])].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-ink-200">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-roxo-500" /> {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <p className="btn-outline mt-6 w-full cursor-not-allowed opacity-60">
                      <CheckCircle2 className="h-4 w-4" /> Plano atual
                    </p>
                  ) : (
                    <a
                      href={linkContratarPlano({
                        email,
                        planoNome: plan.name,
                        planoCodigo: plan.code,
                        valorCents: plan.price_cents,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={(featured ? 'btn-primary' : 'btn-outline') + ' mt-6 flex w-full items-center justify-center gap-2'}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {active ? 'TROCAR PELO WHATSAPP' : 'CONTRATAR PELO WHATSAPP'}
                    </a>
                  )}
                </div>
              );
            })}
      </div>

      {/* ---- Explicação da ativação manual ---- */}
      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-white/10 bg-ink-900/50 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <CalendarClock className="h-5 w-5 text-roxo-400" /> Como funciona a ativação
        </h3>
        <ol className="mt-3 space-y-2 text-sm text-ink-300">
          <li>1. Escolha um plano e clique em <strong className="text-white">CONTRATAR PELO WHATSAPP</strong>.</li>
          <li>2. O WhatsApp abre com a mensagem preenchida (e-mail + plano + valor).</li>
          <li>3. Converse com a equipe e realize o pagamento.</li>
          <li>4. Após a confirmação, sua assinatura é ativada manualmente e o acesso é liberado na hora.</li>
          <li>5. Já é assinante? Você pode trocar de plano (upgrade ou downgrade) a qualquer momento.</li>
        </ol>
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-200">
          <strong>ATIVAÇÃO MANUAL</strong> — Após realizar o pagamento, sua assinatura será ativada manualmente pela equipe MovieFlix.
        </div>
      </div>

      {/* Suporte */}
      <div className="mx-auto mt-6 max-w-2xl text-center">
        <a
          href={linkSuporte(email)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-ink-300 transition hover:text-white"
        >
          <MessageCircle className="h-4 w-4 text-emerald-400" />
          Falar com o {WHATSAPP_LABEL}
        </a>
      </div>
    </div>
  );
}