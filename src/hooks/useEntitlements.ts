import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { entitlementsForSubscription } from '@/lib/plans';
import type { Plan } from '@/types';

/** Retorna os limites (qualidade, telas, downloads) do plano atual do usuário. */
export function useEntitlements() {
  const { subscription } = useAuth();
  const active = hasActiveSubscription(subscription);

  const plans = useQuery({
    queryKey: ['plans'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*');
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const entitlements = entitlementsForSubscription(subscription, active, plans.data);

  return { entitlements, active, subscription, planName: subscription?.plan?.name ?? null };
}
