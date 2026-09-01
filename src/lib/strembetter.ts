/**
 * ════════════════════════════════════════════════════════════════════════════
 * PLAYER NATIVO — player principal de filmes e séries do Movieflix
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O player do Movieflix é NATIVO: um <video> + hls.js alimentado pelo backend
 * do próprio Movieflix (/api/streambetter-resolve → /api/streambetter-hls),
 * que resolve o HLS REAL do título a partir do TMDB ID. Não há iframe de
 * terceiros — logo, por construção: ZERO anúncios, ZERO popups, ZERO
 * redirecionamento externo, e o usuário permanece dentro do Movieflix.
 *
 *   Filmes : streambetter.shop/filme/{tmdbId}
 *   Séries : streambetter.shop/serie/{tmdbId}/{temporada}/{episodio}
 *
 * O embed é gerado AUTOMATICAMENTE a partir do TMDB ID (que já existe no
 * catálogo) — não há URLs manuais por título. Vale para todo o catálogo atual
 * e para novos títulos adicionados futuramente.
 *
 * ── Áudio pt-BR ─────────────────────────────────────────────────────────────
 * O resolver do player busca a fonte do StreamBetter com lang=pt-BR e
 * identifica fontes dubladas (label "Dublado"). O áudio é muxado no HLS (não
 * há faixas separadas), então a faixa dublada já vem entregue quando a fonte
 * é dublada. O Movieflix identifica a disponibilidade real de dublagem pelo
 * campo `dublado_ptbr` do catálogo (nunca inventado) e exibe "Dublado PT-BR"
 * / "Legendado" nos cards.
 *
 * ── Anúncios ────────────────────────────────────────────────────────────────
 *   O player nativo não injeta anúncios e não há iframe de terceiros — a
 *   reprodução é 100% dentro do Movieflix, sem redirecionamento externo.
 *
 * ── Legado ──────────────────────────────────────────────────────────────────
 *   As funções streamBetterMovieUrl/streamBetterSeriesUrl/ehEmbedYapGrid
 *   abaixo são LEGADAS (do antigo player YapGrid) e não são mais usadas pelo
 *   player principal. Mantidas apenas para compatibilidade.
 */

const YAPGRID_BASE = 'https://yapgrid.com';

/** Parâmetro de preferência de idioma (pt) — reforço, não garantia. */
export const AUDIO_PTBR = 'pt';

function withLang(url: string, startSeconds?: number): string {
  const params = new URLSearchParams({ lang: AUDIO_PTBR });
  if (startSeconds && startSeconds > 0) params.set('t', String(startSeconds));
  return `${url}?${params.toString()}`;
}

/** URL do player do YapGrid para um filme, com áudio pt-BR preferido. */
export function streamBetterMovieUrl(tmdbId: number | string | null | undefined, startSeconds?: number): string {
  if (tmdbId == null) return '';
  return withLang(`${YAPGRID_BASE}/embed/movie/${tmdbId}`, startSeconds);
}

/** URL do player do YapGrid para um episódio de série, com áudio pt-BR. */
export function streamBetterSeriesUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
  startSeconds?: number,
): string {
  if (tmdbId == null) return '';
  return withLang(`${YAPGRID_BASE}/embed/tv/${tmdbId}/${season}/${episode}`, startSeconds);
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

/** Atalho: URL de embed do YapGrid a partir de um título do catálogo. */
export function movieEmbedUrl(
  movie: { video_url?: string; tmdb_id?: number | string } | null | undefined,
): string {
  if (!movie) return '';
  if (movie.video_url) return movie.video_url;
  return streamBetterMovieUrl(movie.tmdb_id);
}

/** É uma URL de embed do YapGrid? (player principal do Movieflix) */
export function ehEmbedYapGrid(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'yapgrid.com' || u.hostname.endsWith('.yapgrid.com');
  } catch {
    return false;
  }
}

/** Alias de compatibilidade (nome antigo) — verifica o domínio do YapGrid. */
export const ehEmbedVidCore = ehEmbedYapGrid;

// ─── StreamBetter (fonte do resolver do backend) ────────────────────────────
// O player nativo do MovieFlix resolve o HLS real via o backend
// (/api/streambetter-resolve → /api/streambetter-hls), que consulta o
// StreamBetter com preferência de áudio pt-BR.
const STREAMBETTER_BASE = 'https://streambetter.shop';

/**
 * Chave PÚBLICA do StreamBetter (sb_pk_*).
 *
 * É uma chave de domínio: só funciona quando a página é carregada a partir do
 * domínio autorizado no painel do StreamBetter (movieflix-bszf.onrender.com).
 * Por isso ela é pública por natureza e pode ir no bundle do frontend; ela
 * NÃO substitui a chave de servidor usada pelo resolver do backend.
 *
 * Formato oficial do embed:  https://streambetter.shop/filme/{tmdbId}?key=...
 */
export const STREAMBETTER_PUBLIC_KEY =
  (import.meta.env.VITE_STREAMBETTER_PUBLIC_KEY as string | undefined) ||
  'sb_pk_331739a18c650ce0f4c56ebcc34c39630485ffa7366a1ed5';

/**
 * Aplica a chave pública (e o idioma pt-BR) numa URL de embed do StreamBetter.
 * Usada quando o embed oficial é aberto DENTRO do MovieFlix — é o navegador do
 * usuário, no domínio autorizado, que apresenta a chave ao provedor.
 */
export function comChavePublica(embedUrl: string, startSeconds?: number): string {
  if (!embedUrl) return '';
  try {
    const u = new URL(embedUrl);
    if (!ehEmbedStreamBetter(embedUrl)) return embedUrl;
    u.searchParams.set('key', STREAMBETTER_PUBLIC_KEY);
    u.searchParams.set('lang', 'pt-BR');
    // Tema vermelho/roxo do MovieFlix no player do StreamBetter (parâmetros
    // oficiais de personalização do embed: accent/bg/brand).
    u.searchParams.set('accent', 'DF0A15'); // vermelho MovieFlix
    u.searchParams.set('bg', '0d0b1a'); // roxo-escuro profundo
    u.searchParams.set('brand', 'MovieFlix');
    if (startSeconds && startSeconds > 0) u.searchParams.set('t', String(Math.floor(startSeconds)));
    return u.toString();
  } catch {
    return embedUrl;
  }
}


/** URL do embed do StreamBetter para um filme (tmdb_id). */
export function streambetterMovieEmbedUrl(tmdbId: number | string | null | undefined): string {
  if (tmdbId == null) return '';
  return `${STREAMBETTER_BASE}/filme/${tmdbId}`;
}

/** URL do embed do StreamBetter para um episódio de série. */
export function streambetterSeriesEmbedUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
): string {
  if (tmdbId == null) return '';
  return `${STREAMBETTER_BASE}/serie/${tmdbId}/${season}/${episode}`;
}

/** É uma URL do StreamBetter? (fonte resolvida pelo player nativo) */
export function ehEmbedStreamBetter(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'streambetter.shop' || u.hostname.endsWith('.streambetter.shop');
  } catch {
    return false;
  }
}

