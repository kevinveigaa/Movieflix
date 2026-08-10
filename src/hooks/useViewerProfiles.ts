import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { ViewerProfile } from '@/types';

export interface ProfileInput {
  name: string;
  avatar: string;
  is_kid: boolean;
}

/**
 * CRUD dos perfis de exibição (viewer_profiles) do usuário logado.
 * O limite por plano (2/3/5) é aplicado na UI; as chamadas ao banco
 * respeitam a RLS (cada usuário só enxerga os próprios perfis).
 */
export function useViewerProfiles() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ViewerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('viewer_profiles')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true });
    if (!error) setProfiles((data as ViewerProfile[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (input: ProfileInput): Promise<{ error?: string }> => {
      if (!user) return { error: 'Faça login para criar um perfil.' };
      const { error } = await supabase.from('viewer_profiles').insert({
        owner_id: user.id,
        name: input.name.trim(),
        avatar_url: input.avatar,
        is_kid: input.is_kid,
      });
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [user, load],
  );

  const update = useCallback(
    async (id: string, input: ProfileInput): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from('viewer_profiles')
        .update({
          name: input.name.trim(),
          avatar_url: input.avatar,
          is_kid: input.is_kid,
        })
        .eq('id', id);
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [load],
  );

  const remove = useCallback(
    async (id: string): Promise<{ error?: string }> => {
      const { error } = await supabase.from('viewer_profiles').delete().eq('id', id);
      if (error) return { error: error.message };
      await load();
      return {};
    },
    [load],
  );

  return { profiles, loading, create, update, remove, refresh: load };
}
