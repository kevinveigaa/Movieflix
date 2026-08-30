/**
 * Trial Gate — cliente frontend.
 *
 * O teste grátis de 20 segundos é controlado NO SERVIDOR (tabela
 * trial_sessions + endpoint /api/trial-gate). Este módulo expõe:
 *
 *   - gateStream(): resolve o stream HLS real via /api/trial-gate, que valida
 *     a assinatura E o saldo de teste no banco ANTES de devolver a URL. Um
 *     usuário sem assinatura com teste esgotado recebe 402 e NENHUM stream.
 *   - fetchTrialInfo(): lê a própria linha de trial_sessions (RLS permite o
 *     usuário ler só a dele) para o contador de 20s e para bloquear na hora
 *     se o teste já foi consumido (recarregar a página não zera nada).
 *   - consumeTrialTime(): heartbeat do player — registra no banco o tempo de
 *     teste realmente assistido (o total é persistido por conta, não por
 *     dispositivo/aba).
 */

import { supabase } from '@/lib/supabase';

// O site pode ser publicado como Static Site (sem backend na mesma origem \u2014
// onde /api/* responde o HTML do SPA e a autoriza\u00e7\u00e3o quebra). Por isso o
// cliente usa nesta ordem:
//   1. VITE_API_URL, se definida no build (ex.: proxy pr\u00f3prio);
//   2. o backend p\u00fablico do MovieFlix, que tem CORS liberado (server.js).
const API_URL = (import.meta.env.VITE_API_URL as string) || 'https://movieflix-api-udsv.onrender.com';

export interface TrialInfo {
  trialSeconds: number;
  remainingSeconds: number;
  consumedSeconds: number;
  consumedAt: string | null;
}

/** Lê o estado do teste grátis da conta (0 = esgotado). NULL = tabela ausente (fail-open). */
export async function fetchTrialInfo(userId: string): Promise<TrialInfo | null> {
  try {
    const { data } = await supabase
      .from('trial_sessions')
      .select('trial_seconds, consumed_seconds, consumed_at, expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      // Sem linha: nunca usou o teste → 20s disponíveis (e o servidor cria a
      // linha no primeiro heartbeat/consume).
      return { trialSeconds: 20, remainingSeconds: 20, consumedSeconds: 0, consumedAt: null };
    }
    const trialSeconds = Number(data.trial_seconds) || 20;
    const consumed = Number(data.consumed_seconds) || 0;
    const expirado = data.expires_at && new Date(data.expires_at) < new Date();
    const esgotado = Boolean(data.consumed_at) || consumed >= trialSeconds || expirado;
    return {
      trialSeconds,
      remainingSeconds: esgotado ? 0 : Math.max(0, trialSeconds - consumed),
      consumedSeconds: consumed,
      consumedAt: data.consumed_at ?? null,
    };
  } catch {
    // Falha de rede/RLS: fail-open (não quebra o player se o banco não migrou).
    return null;
  }
}

export interface TrialGateResult {
  authorized: boolean;
  url?: string;
  kind?: string;
  label?: string;
  sub?: string;
  motivo?: string;
  detalhe?: string;
  trial?: { trialSeconds: number; consumedSeconds: number; remainingSeconds: number } | null;
  trialToken?: string | null;
}

/**
 * Resolve o stream via /api/trial-gate (autorização server-side).
 * Usado SEMPRE que o usuário não tem assinatura ativa.
 */
export async function gateStream(embedUrl: string, startSeconds?: number): Promise<TrialGateResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { authorized: false, motivo: 'sem_sessao' };

    const params = new URLSearchParams({ embed: embedUrl });
    if (startSeconds && startSeconds > 0) params.set('t', String(startSeconds));

    const resp = await fetch(`${API_URL}/api/trial-gate?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 402) {
      return { authorized: false, motivo: 'assinatura_necessaria', trial: data.trial ?? null };
    }
    if (!resp.ok) return { authorized: false, motivo: `http_${resp.status}` };
    const dataResult = (await resp.json()) as TrialGateResult;
    // O resolver devolve o stream via caminho relativo (/api/streambetter-hls?...)
    // para evitar o CORS 403 do streambetter.shop no navegador. Prefixa com a
    // API_URL para o hls.js carregar do backend (que tem CORS aberto).
    if (dataResult.authorized && dataResult.url && dataResult.url.startsWith('/')) {
      dataResult.url = `${API_URL}${dataResult.url}`;
    }
    return dataResult;
  } catch (e) {
    console.warn('[TrialGate] falha ao autorizar stream:', e);
    return { authorized: false, motivo: 'network' };
  }
}

/** Heartbeat: registra tempo de teste assistido no banco (server-side). */
export async function consumeTrialTime(
  trialToken: string,
  seconds: number,
): Promise<{ ok: boolean; remainingSeconds: number; expired: boolean }> {
  try {
    const resp = await fetch(`${API_URL}/api/trial-consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trialToken, seconds: Math.max(1, Math.floor(seconds || 0)) }),
      keepalive: true,
    });
    const data = await resp.json().catch(() => ({}));
    return {
      ok: Boolean(data.ok),
      remainingSeconds: Number(data.remainingSeconds ?? 0),
      expired: Boolean(data.expired),
    };
  } catch {
    return { ok: false, remainingSeconds: 0, expired: false };
  }
}