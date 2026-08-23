/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STREAMBETTER — fonte oficial de filmes e séries do Movieflix
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todos os títulos do catálogo vêm de https://streambetter.shop (API de
 * streaming com catálogo próprio e player embutível). Nada de players de
 * terceiros (vidlink.pro, megaembedapi, VidZee etc.) — o player do
 * StreamBetter é embutido DENTRO do site Movieflix, via <iframe>.
 *
 * ── Catálogo ────────────────────────────────────────────────────────────────
 *   O catálogo é gerado offline por `node gerar-catalogo.cjs` e publicado em
 *   filmes/filmes.json + filmes/series.json (importados pelo front). A API
 *   pública https://streambetter.shop/api/titles continua sendo a fonte
 *   original dos dados.
 *
 * ── Player embed ────────────────────────────────────────────────────────────
 *   Filmes : https://streambetter.shop/filme/{tmdb_id}?lang=pt-BR
 *   Séries : https://streambetter.shop/serie/{tmdb_id}/{temporada}/{episodio}?lang=pt-BR
 *   O player resolve as fontes, legendas e fallbacks do outro lado.
 *
 * ── Áudio pt-BR ─────────────────────────────────────────────────────────────
 *   O player do StreamBetter seleciona automaticamente a faixa de áudio em
 *   português quando disponível (verificado no bundle do player: procura
 *   trilhas cujo lang começa com "pt"/"por" ou cujo nome contém "portug").
 *   `lang=pt-BR` na URL reforça a preferência.
 *
 * ── Anúncios ────────────────────────────────────────────────────────────────
 *   O Movieflix não injeta nenhum anúncio próprio. O embed gratuito segue o
 *   player padrão do StreamBetter e pode exibir o anúncio do plano free;
 *   para um embed 100% sem anúncios é preciso o plano Creator (chave
 *   sb_pk_* com trava de domínio) — ver https://streambetter.shop/planos.
 *   NÃO usamos sandbox/blockers no iframe (o StreamBetter detecta e recusa
 *   exibir o conteúdo).
 */

const STREAMBETTER_BASE = 'https://streambetter.shop';

/** Parâmetro de preferência de idioma no embed (pt-BR). */
export const AUDIO_PTBR = 'pt-BR';

/**
 * Chave pública do plano Creator do StreamBetter (opcional).
 * Sem anúncios no embed: https://streambetter.shop/planos → Creator →
 * gere a chave sb_pk_* e cadastre o domínio do Movieflix. Defina
 * VITE_STREAMBETTER_KEY no build para ativá-la (a chave é pública por
 * natureza — vai na URL do iframe).
 */
const STREAMBETTER_KEY = (import.meta.env.VITE_STREAMBETTER_KEY as string) || '';

function withLangAndKey(url: string): string {
  const params = new URLSearchParams({ lang: AUDIO_PTBR });
  if (STREAMBETTER_KEY) params.set('key', STREAMBETTER_KEY);
  return `${url}?${params.toString()}`;
}

/** URL do player do StreamBetter para um filme, com áudio pt-BR preferido. */
export function streamBetterMovieUrl(tmdbId: number | string | null | undefined): string {
  if (tmdbId == null) return '';
  return withLangAndKey(`${STREAMBETTER_BASE}/filme/${tmdbId}`);
}

/** URL do player do StreamBetter para um episódio de série, com áudio pt-BR. */
export function streamBetterSeriesUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
): string {
  if (tmdbId == null) return '';
  return withLangAndKey(`${STREAMBETTER_BASE}/serie/${tmdbId}/${season}/${episode}`);
}

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
  const [seasonStr, epStr] = String(eps[0]).split('/');
  const season = Number(seasonStr);
  const episode = Number(epStr);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;
  return { season, episode };
}

/** Atalho: URL de embed do StreamBetter a partir de um título do catálogo. */
export function movieEmbedUrl(
  movie: { video_url?: string; tmdb_id?: number | string } | null | undefined,
): string {
  if (!movie) return '';
  if (movie.video_url) return movie.video_url;
  return streamBetterMovieUrl(movie.tmdb_id);
}
