/**
 * ════════════════════════════════════════════════════════════════════════════
 * PLAYER — EMBED OFICIAL do StreamBetter (plano Creator, chave pública sb_pk_*)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O player do MovieFlix usa o EMBED OFICIAL do StreamBetter (plano Creator,
 * chave pública sb_pk_*), montado num iframe. O provedor controla player,
 * fontes, legendas, áudio e reprodução — o MovieFlix apenas hospeda o iframe.
 *
 *   Filmes : streambetter.shop/filme/{tmdbId}?key=sb_pk_...
 *   Séries : streambetter.shop/serie/{tmdbId}/{temporada}/{episodio}?key=sb_pk_...
 *
 * NÃO usamos a API de link direto (/api/v1/stream), que exige o plano API /
 * chave secreta sb_sk_*. A montagem da URL (com a chave pública) fica
 * centralizada em src/lib/streamEmbed.ts — estas funções apenas delegam para
 * manter a compatibilidade com o resto do código.
 *
 * ── Áudio pt-BR ─────────────────────────────────────────────────────────────
 * O resolver do player busca a fonte do StreamBetter com lang=pt-BR e
 * identifica fontes dubladas (label "Dublado"). O áudio é muxado no HLS (não
 * há faixas separadas), então a faixa dublada já vem entregue quando a fonte
 * é dublada. O MovieFlix identifica a disponibilidade real de dublagem pelo
 * campo `dublado_ptbr` do catálogo (nunca inventado).
 *
 * ── Anúncios ────────────────────────────────────────────────────────────────
 * O embed oficial não injeta anúncios e não há iframe de terceiros — a
 * reprodução é 100% dentro do MovieFlix, sem redirecionamento externo. A
 * proteção contra popups/redirects é feita pelo antiAds global
 * (src/lib/antiAds.ts).
 */

/** Parâmetro de preferência de idioma (pt) — reforço, não garantia. */
export const AUDIO_PTBR = 'pt';

/**
 * Melhor episódio disponível de uma série (usa o primeiro episódio com fonte
 * cadastrada — dados de filmes/series.json, campo episodes_available).
 */
export function primeiroEpisodioDisponivel(
  serie: { episodes_available?: string[]; tmdb_id?: number | string } | null | undefined,
): { season: number; episode: number } | null {
  if (!serie) return null;
  const eps = serie.episodes_available ?? [];
  if (eps.length === 0) return null;
  // IMPORTANTE: o catálogo pode trazer episódios em ordem inversa (ex.:
  // ["1/8","1/7",...]). NUNCA confie em eps[0] — ordene (temporada asc,
  // episódio asc) e pegue o primeiro de verdade (ex.: 1/1), senão o player
  // abre o último episódio e parece "quebrado".
  const ordenados = eps
    .map((e) => {
      const [s, ep] = String(e).split('/');
      const season = Number(s);
      const episode = Number(ep);
      if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;
      return { season, episode };
    })
    .filter((e): e is { season: number; episode: number } => e !== null)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  if (ordenados.length === 0) return null;
  return ordenados[0];
}

// ──────── StreamBetter (EMBED OFICIAL — plano Creator, chave pública sb_pk_*) ────────
// O player do MovieFlix usa o EMBED OFICIAL do StreamBetter (plano Creator),
// montado com a chave pública sb_pk_* (VITE_STREAMBETTER_PUBLIC_KEY). NÃO
// usamos a API de link direto (/api/v1/stream), que exige o plano API / chave
// secreta sb_sk_*. A montagem da URL (com a chave) fica centralizada em
// src/lib/streamEmbed.ts — estas funções apenas delegam para manter a
// compatibilidade com o resto do código.
import { buildStreamBetterMovieUrl, buildStreamBetterSeriesUrl } from '@/lib/streamEmbed';

/** URL do embed oficial do StreamBetter para um filme (tmdb_id), com a chave pública. */
export function streambetterMovieEmbedUrl(tmdbId: number | string | null | undefined): string {
  return buildStreamBetterMovieUrl(tmdbId);
}

/** URL do embed oficial do StreamBetter para um episódio de série, com a chave pública. */
export function streambetterSeriesEmbedUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
): string {
  return buildStreamBetterSeriesUrl(tmdbId, season, episode);
}