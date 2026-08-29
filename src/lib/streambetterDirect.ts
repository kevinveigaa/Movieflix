/**
 * StreamBetter Direct — cliente frontend.
 *
 * Em vez de embutir o iframe do StreamBetter (que no plano free injeta o
 * overlay "Só mais um passo" / "Reprodução bloqueada" DENTRO do iframe
 * cross-origin, impossível de fechar via JS da página pai, e pode redirecionar),
 * o Movieflix pede ao SEU backend que resolva o stream HLS real e reproduz
 * num <video> nativo + hls.js. Resultado: ZERO anúncios, ZERO redirecionamento,
 * ZERO mensagens de bloqueio.
 *
 * O endpoint /api/streambetter-resolve é servido pelo backend Express na mesma
 * origem (em produção Render; em dev, o vite proxy /api → localhost:5000).
 */

// O site pode ser publicado como Static Site (sem backend na mesma origem \u2014
// onde /api/* responde o HTML do SPA e a resolu\u00e7\u00e3o quebra). Por isso o
// cliente usa nesta ordem:
//   1. VITE_API_URL, se definida no build (ex.: proxy pr\u00f3prio);
//   2. o backend p\u00fablico do MovieFlix, que tem CORS liberado (server.js).
const API_URL = (import.meta.env.VITE_API_URL as string) || 'https://movieflix-api-udsv.onrender.com';

export interface StreamBetterDirectResult {
  success: boolean;
  url?: string;
  kind?: 'stream' | 'mp4';
  label?: string;
  sub?: string;
  titleId?: number | null;
  episodeId?: number | null;
  showAds?: boolean;
  motivo?: string;
  detalhe?: string;
  erro?: string;
  /** Autorizado pelo servidor? (trial-gate) — ausente no resolve comum. */
  authorized?: boolean;
  /** Token de consumo do teste grátis (trial-gate). */
  trialToken?: string | null;
  /** Estado do teste grátis devolvido pelo servidor. */
  trial?: { trialSeconds: number; consumedSeconds: number; remainingSeconds: number } | null;
}

/**
 * Resolve a fonte direta (HLS) de um embed do StreamBetter.
 * @param embedUrl URL do embed (https://streambetter.shop/filme/... ou /serie/...)
 * @param startSeconds tempo de retomada (opcional)
 */
export async function resolverStreamBetterDireto(
  embedUrl: string,
  startSeconds?: number,
): Promise<StreamBetterDirectResult> {
  try {
    const params = new URLSearchParams({ embed: embedUrl });
    if (startSeconds && startSeconds > 0) params.set('t', String(startSeconds));
    const resp = await fetch(`${API_URL}/api/streambetter-resolve?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
      return { success: false, motivo: `http_${resp.status}` };
    }
    return (await resp.json()) as StreamBetterDirectResult;
  } catch (e) {
    console.warn('[StreamBetterDirect] falha ao resolver fonte direta:', e);
    return { success: false, motivo: 'network' };
  }
}

/** É uma URL de embed do StreamBetter? */
export function ehEmbedStreamBetter(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'streambetter.shop' || u.hostname.endsWith('.streambetter.shop');
  } catch {
    return false;
  }
}
