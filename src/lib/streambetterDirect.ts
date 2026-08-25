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
    const resp = await fetch(`/api/streambetter-resolve?${params.toString()}`, {
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
