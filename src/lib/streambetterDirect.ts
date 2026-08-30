/**
 * StreamBetter Direct — cliente frontend.
 *
 * O MovieFlix não abre o iframe do provedor. Em vez disso, pede ao backend
 * para resolver a fonte HLS e reproduz o resultado em um <video> nativo.
 * Assim, pop-ups, anúncios e redirecionamentos do player externo nunca entram
 * na árvore de documentos do MovieFlix.
 */

// Em produção o frontend pode ser um Static Site, então /api pode não existir
// na mesma origem. VITE_API_URL permite apontar para o backend Express; o
// backend público abaixo mantém o comportamento atual quando a variável não
// é configurada.
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
}

/**
 * Resolve a fonte direta (HLS) de um embed do StreamBetter.
 * O backend sempre força lang=pt-BR antes de consultar o provedor.
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

    if (!resp.ok) return { success: false, motivo: `http_${resp.status}` };

    const data = (await resp.json()) as StreamBetterDirectResult;
    // O backend devolve um caminho relativo para que o HLS passe pelo proxy
    // do MovieFlix e não dependa de CORS do host upstream.
    if (data.success && data.url?.startsWith('/')) {
      data.url = `${API_URL}${data.url}`;
    }
    return data;
  } catch (error) {
    console.warn('[StreamBetterDirect] falha ao resolver fonte direta:', error);
    return { success: false, motivo: 'network' };
  }
}
