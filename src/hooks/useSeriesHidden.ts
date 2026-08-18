import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const SETTING_KEY = 'series_hidden';

/**
 * Controle global "Esconder séries".
 *
 * Lê a configuração `site_settings.series_hidden` (tabela criada pela migration
 * `site_settings_esconder_series`). Se a tabela/linha ainda não existir, retorna
 * `false` (séries visíveis) para nunca esconder conteúdo por acidente — basta
 * aplicar a migration e alternar no painel admin.
 */
export function useSeriesHidden() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['site-settings', SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (error) return false;
      return Boolean(data?.value);
    },
    staleTime: 1000 * 60 * 5,
  });

  const mutation = useMutation({
    mutationFn: async (hidden: boolean) => {
      const { error } = await supabase
        .from('site_settings')
        .upsert(
          { key: SETTING_KEY, value: hidden, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings', SETTING_KEY] });
    },
  });

  return {
    /** true = séries escondidas no site (o cliente vê só filmes). */
    seriesHidden: Boolean(query.data),
    isLoading: query.isLoading,
    setSeriesHidden: mutation.mutate,
    isToggling: mutation.isPending,
    error: mutation.error,
  };
}
