import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Crown, Lock, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Plan } from '@/types';
import { entitlementHighlights } from '@/lib/plans';

/**
 * Paywall de assinatura — bloqueio TOTAL de reprodução.
 *
 * Exibido na PlayerPage quando a conta NÃO possui nenhum dos 3 planos de
 * assinatura ativo (status 'active' + expires_at no futuro). Não há teste
 * grátis nem reprodução parcial: o usuário precisa assinar para assistir
 * filmes e séries. O trial-gate do servidor (/api/trial-gate) permanece como
 * defesa em profundidade para streams resolvidos via backend.
 *
 * Busca os planos na tabela `plans` (mesmo padrão da SubscriptionPage) e
 * oferece um CTA por plano, todos apontando para /minha-assinatura.
 */
export function SubscriptionPaywall() {
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_cents', { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/95 p-4 backdrop-blur-sm"
      data-playback-blocked
    >
      <div className="w-full max-w-3xl py-8">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-600/15 ring-1 ring-brand-500/40">
            <Lock className="h-7 w-7 text-brand-400" />
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold text-white sm:text-4xl">
            Assine um plano para assistir
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-zinc-400">
            Você precisa de uma assinatura ativa para assistir filmes e séries no MovieFlix.
            Escolha um dos 3 planos abaixo — cancele quando quiser.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {plans.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-52 rounded-2xl" />
              ))
            : plans.data?.map((plan) => {
                const featured = plan.code === 'standard';
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-2xl border p-5 ${
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
                    <h3 className="flex items-center gap-2 text-base font-bold text-white">
                      <Crown className="h-4 w-4 text-brand-400" />
                      {plan.name}
                    </h3>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="font-display text-3xl text-white">
                        R$ {(plan.price_cents / 100).toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-xs text-zinc-500">/mês</span>
                    </div>
                    <ul className="mt-4 flex-1 space-y-2">
                      {[...entitlementHighlights(plan), ...(plan.features ?? [])]
                        .slice(0, 4)
                        .map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-500" /> {f}
                          </li>
                        ))}
                    </ul>
                    <Link
                      to="/minha-assinatura"
                      data-tv-focusable
                      className={(featured ? 'btn-primary' : 'btn-outline') + ' mt-5 flex w-full items-center justify-center gap-2'}
                    >
                      Assinar
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })}
        </div>

        {!plans.isLoading && (!plans.data || plans.data.length === 0) && (
          <div className="mt-6 text-center">
            <Link to="/minha-assinatura" data-tv-focusable className="btn-primary inline-flex items-center gap-2">
              Ver planos de assinatura
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-zinc-500">
          Já assinei —{' '}
          <Link to="/minha-assinatura" className="text-brand-400 underline hover:text-brand-300">
            verificar minha assinatura
          </Link>
        </p>
      </div>
    </div>
  );
}
