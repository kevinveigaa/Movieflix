import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Crown, Check, ArrowRight, AlertTriangle, CalendarClock, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import { diasRestantes, formatarVencimento, avisoVencimento, entitlementHighlights } from '@/lib/plans';
import type { Plan } from '@/types';
import { cn } from '@/lib/cn';
import { linkContratarPlano, linkRenovarPlano, abrirWhatsApp } from '@/lib/whatsapp';

/**
 * TvSubscriptionPage — planos e status da assinatura (TV).
 *
 * - Se tem assinatura ativa: mostra plano, status, dias restantes,
 *   vencimento e aviso de proximidade (5/3/1 dias — mesmas regras do site).
 * - Se não tem: mostra os planos disponíveis (do banco `plans`) com
 *   botão para contratar via WhatsApp (ativação manual pela equipe).
 * - Navegação 100% por controle remoto.
 */

export function TvSubscriptionPage() {
  const navigate = useNavigate();
  const { user, subscription, loading } = useAuth();
  const [verPlanos, setVerPlanos] = useState(false);

  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_cents', { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const assinante = hasActiveSubscription(subscription);
  const dias = diasRestantes(subscription?.expires_at);
  const aviso = avisoVencimento(subscription?.expires_at);
  const email = user?.email ?? '';

  if (loading) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-loading">
          <div className="tv-loading-spinner" />
          <p>Verificando sua assinatura…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error">
          <h2>Faça login para ver sua assinatura</h2>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/')}>
            Ir para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">Assinatura</h1>

      {assinante && subscription ? (
        <div className="tv-sub-status">
          <div className="tv-sub-status-head">
            <Crown className="tv-icon tv-icon-lg tv-icon-brand" />
            <div>
              <h2>Sua assinatura está ativa</h2>
              <p className="tv-sub-plan">
                {subscription.plan?.name ?? 'Plano MovieFlix'}
                {subscription.plan ? ` · R$ ${(subscription.plan.price_cents / 100).toFixed(2).replace('.', ',')}/mês` : ''}
              </p>
            </div>
          </div>
          <div className="tv-sub-status-meta">
            <div className="tv-sub-meta-item">
              <span className="tv-sub-meta-label">Status</span>
              <span className="tv-sub-meta-value tv-sub-ok">Ativo</span>
            </div>
            <div className="tv-sub-meta-item">
              <span className="tv-sub-meta-label">Dias restantes</span>
              <span className="tv-sub-meta-value">{dias} {dias === 1 ? 'dia' : 'dias'}</span>
            </div>
            <div className="tv-sub-meta-item">
              <span className="tv-sub-meta-label">Vencimento</span>
              <span className="tv-sub-meta-value">{formatarVencimento(subscription.expires_at)}</span>
            </div>
          </div>
          {aviso.mensagem ? (
            <div className={cn('tv-sub-aviso', aviso.nivel === '1' && 'tv-sub-aviso-urgente')}>
              <AlertTriangle className="tv-icon" />
              {aviso.mensagem}
            </div>
          ) : null}
          <a
            data-tv-focusable
            tabIndex={0}
            className="tv-btn tv-btn-primary tv-btn-lg"
            href={linkRenovarPlano({ email, planoNome: subscription.plan?.name, planoCodigo: subscription.plan_code })}
            onClick={(e) => {
              e.preventDefault();
              void abrirWhatsApp(linkRenovarPlano({ email, planoNome: subscription.plan?.name, planoCodigo: subscription.plan_code }));
            }}
          >
            Renovar pelo WhatsApp <ArrowRight className="tv-icon" />
          </a>
        </div>
      ) : (
        <div className="tv-sub-empty">
          <Crown className="tv-icon tv-icon-lg tv-icon-brand" />
          <h2>Você ainda não tem uma assinatura ativa</h2>
          <p>Assine para assistir filmes e séries completos no MovieFlix TV.</p>
          <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-primary tv-btn-lg" onClick={() => setVerPlanos(true)}>
            Ver planos <ArrowRight className="tv-icon" />
          </button>
        </div>
      )}

      {verPlanos ? (
        <div className="tv-plans">
          {plans.isLoading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="tv-plan tv-plan-skeleton" />)
            : (plans.data ?? []).map((plan) => (
                <div key={plan.id} className="tv-plan">
                  <h3 className="tv-plan-name">{plan.name}</h3>
                  <div className="tv-plan-price">
                    R$ {(plan.price_cents / 100).toFixed(2).replace('.', ',')}
                    <span>/mês</span>
                  </div>
                  <ul className="tv-plan-features">
                    {[...entitlementHighlights(plan), ...(plan.features ?? [])].slice(0, 4).map((f) => (
                      <li key={f}>
                        <Check className="tv-icon tv-icon-sm" /> {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    data-tv-focusable
                    tabIndex={0}
                    className="tv-btn tv-btn-primary"
                    href={linkContratarPlano({
                      email,
                      planoNome: plan.name,
                      planoCodigo: plan.code,
                      valorCents: plan.price_cents,
                    })}
                    onClick={(e) => {
                      e.preventDefault();
                      void abrirWhatsApp(linkContratarPlano({
                        email,
                        planoNome: plan.name,
                        planoCodigo: plan.code,
                        valorCents: plan.price_cents,
                      }));
                    }}
                  >
                    <MessageCircle className="tv-icon tv-icon-sm" /> Contratar pelo WhatsApp <ArrowRight className="tv-icon" />
                  </a>
                </div>
              ))}
          <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={() => setVerPlanos(false)}>
            Fechar planos
          </button>
        </div>
      ) : null}

      <p className="tv-sub-note">
        <CalendarClock className="tv-icon tv-icon-sm" />
        O pagamento é feito pelo WhatsApp e a ativação é manual pela equipe MovieFlix. Renovação antes do vencimento soma os dias restantes ao novo período.
      </p>
    </div>
  );
}