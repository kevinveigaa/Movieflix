import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_MS = 20000;
const STALE_SECONDS = 60;

function deviceId(): string {
  const key = 'mf_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Controla o limite de telas simultâneas do plano.
 * Registra uma "sessão de reprodução" na tabela playback_sessions e mantém
 * um heartbeat. Se a tabela não existir, libera a reprodução (fail-open).
 */
export function usePlaybackSession(userId: string | undefined, maxScreens: number, enabled: boolean) {
  const [blocked, setBlocked] = useState(false);
  const [activeScreens, setActiveScreens] = useState(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !userId || maxScreens <= 0) return;

    const device = deviceId();
    let cancelled = false;

    async function beat() {
      const since = new Date(Date.now() - STALE_SECONDS * 1000).toISOString();

      const up = await supabase
        .from('playback_sessions')
        .upsert(
          { user_id: userId, device_id: device, last_seen: new Date().toISOString() },
          { onConflict: 'user_id,device_id' },
        );

      // Tabela ausente / sem permissão: não bloqueia o usuário
      if (up.error) return;

      const { data, error } = await supabase
        .from('playback_sessions')
        .select('device_id')
        .eq('user_id', userId)
        .gt('last_seen', since);

      if (error || cancelled) return;

      const devices = new Set((data ?? []).map((r: { device_id: string }) => r.device_id));
      devices.add(device);
      setActiveScreens(devices.size);
      setBlocked(devices.size > maxScreens);
    }

    beat();
    timer.current = setInterval(beat, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      supabase
        .from('playback_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', device)
        .then(() => {});
    };
  }, [userId, maxScreens, enabled]);

  return { blocked, activeScreens };
}
