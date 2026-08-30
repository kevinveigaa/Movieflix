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
// O player nativo do Movieflix resolve o HLS REAL via o backend
// (/api/streambetter-resolve → /api/streambetter-hls), que busca a fonte no
// StreamBetter e identifica fontes dubladas (label "Dublado"). Estas URLs são
// o que o resolver espera (filme / serie/{s}/{e}).
const STREAMBETTER_BASE = 'https://streambetter.shop';

/** URL do embed do StreamBetter para um filme (o que o resolver resolve). */
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

/** É uma URL de embed do StreamBetter? (fonte do player nativo) */
export function ehEmbedStreamBetter(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'streambetter.shop' || u.hostname.endsWith('.streambetter.shop');
  } catch {
    return false;
  }
}

// ──── CineSrc (fallback de embed do player) ────────────────────────────────
// Quando o resolver do StreamBetter falha (upstream fora do ar / sem stream
// direto), o player cai automaticamente para o iframe do CineSrc, que fornece
// o PRÓPRIO player (play, seek, volume, fullscreen, cast) e prioriza áudio
// pt-BR via `lang=pt-BR`. O CineSrc é testado e reproduz de verdade (filme e
// série) com o TMDB ID.
const CINESRC_BASE = 'https://cinesrc.st';

/** URL do player do CineSrc para um filme (tmdb_id), com áudio pt-BR preferido. */
export function cinesrcMovieEmbedUrl(tmdbId: number | string | null | undefined): string {
  if (tmdbId == null) return '';
  return `${CINESRC_BASE}/embed/movie/${tmdbId}?lang=pt-BR`;
}

/** URL do player do CineSrc para um episódio de série (tmdb_id + s + e), com áudio pt-BR. */
export function cinesrcSeriesEmbedUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
): string {
  if (tmdbId == null) return '';
  return `${CINESRC_BASE}/embed/tv/${tmdbId}?s=${season}&e=${episode}&lang=pt-BR`;
}

/** É uma URL de embed do CineSrc? */
export function ehEmbedCineSrc(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'cinesrc.st' || u.hostname.endsWith('.cinesrc.st');
  } catch {
    return false;
  }
}

/**
 * Monta a URL de FALLBACK do CineSrc a partir de uma URL de embed do
 * StreamBetter (https://streambetter.shop/filme/{tmdb} ou
 * /serie/{tmdb}/{s}/{e}). Retorna '' se a URL não for do StreamBetter.
 */
export function fallbackEmbedUrlDoStreambetter(embedUrl: string): string {
  try {
    const u = new URL(embedUrl);
    if (u.hostname !== 'streambetter.shop' && !u.hostname.endsWith('.streambetter.shop')) return '';
    const partes = u.pathname.split('/').filter(Boolean);
    // /filme/{tmdbId}
    if (partes[0] === 'filme' && partes[1]) {
      return cinesrcMovieEmbedUrl(partes[1]);
    }
    // /serie/{tmdbId}/{season}/{episode}
    if (partes[0] === 'serie' && partes[1]) {
      const season = Number(partes[2]) || 1;
      const episode = Number(partes[3]) || 1;
      return cinesrcSeriesEmbedUrl(partes[1], season, episode);
    }
    return '';
  } catch {
    return '';
  }
}