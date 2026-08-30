/**
 * ════════════════════════════════════════════════════════════════════════════
 * CINESRC — player principal de filmes e séries do Movieflix
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O player do Movieflix usa o CineSrc (https://cinesrc.st), um serviço de
 * embed de filmes e séries baseado em TMDB ID (mantido pela equipe ShuttleTV).
 * O CineSrc resolve as fontes, legendas, áudio e qualidade do outro lado, num
 * player self-contained (com play, seek, volume, fullscreen, PiP e cast) — sem
 * overlay "Abrir link", sem redirecionamento externo e sem anúncios próprios
 * do Movieflix.
 *
 *   Filmes : https://cinesrc.st/embed/movie/{tmdbId}
 *   Séries : https://cinesrc.st/embed/tv/{tmdbId}?s={temporada}&e={episodio}
 *
 * O embed é gerado AUTOMATICAMENTE a partir do TMDB ID (que já existe no
 * catálogo) — não há URLs manuais por título. Vale para todo o catálogo atual
 * e para novos títulos adicionados futuramente.
 *
 * ── Áudio pt-BR ─────────────────────────────────────────────────────────────
 * O player do CineSrc seleciona a faixa de áudio disponível. O Movieflix
 * identifica a disponibilidade real de dublagem pelo campo `dublado_ptbr` do
 * catálogo (nunca inventado) e exibe "Dublado PT-BR" / "Legendado" nos cards.
 *
 * ── Anúncios ───────────────────────────────────────────────────────────────
 *   O Movieflix não injeta nenhum anúncio próprio. O embed do CineSrc é
 *   incorporado DENTRO do site/app (iframe), sem redirecionamento externo.
 */

const EMBED_BASE = 'https://www.2embed.cc';

/** Parâmetro de preferência de idioma (pt-BR) — reforço, não garantia. */
export const AUDIO_PTBR = 'pt-BR';

// O 2embed seleciona a faixa de áudio disponível automaticamente (prioriza
// pt-BR quando existe). NÃO adicionamos `?lang=` — o 2embed redireciona para
// a página de detalhes quando recebe esse parâmetro, quebrando o player.
// Apenas o `seek` (retomada) é anexado quando há posição salva.
function withLang(url: string, startSeconds?: number): string {
  if (startSeconds && startSeconds > 0) {
    return `${url}?t=${Math.floor(startSeconds)}`;
  }
  return url;
}

/** URL do player do 2embed para um filme, com áudio pt-BR preferido. */
export function streamBetterMovieUrl(tmdbId: number | string | null | undefined, startSeconds?: number): string {
  if (tmdbId == null) return '';
  return withLang(`${EMBED_BASE}/embed/${tmdbId}`, startSeconds);
}

/** URL do player do 2embed para um episódio de série, com áudio pt-BR. */
export function streamBetterSeriesUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
  startSeconds?: number,
): string {
  if (tmdbId == null) return '';
  return withLang(`${EMBED_BASE}/embedtv/${tmdbId}&s=${season}&e=${episode}`, startSeconds);
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

/** Atalho: URL de embed do 2embed a partir de um título do catálogo. */
export function movieEmbedUrl(
  movie: { video_url?: string; tmdb_id?: number | string } | null | undefined,
): string {
  if (!movie) return '';
  if (movie.video_url) return movie.video_url;
  return streamBetterMovieUrl(movie.tmdb_id);
}

/** É uma URL de embed do 2embed? (player principal do Movieflix) */
export function ehEmbedVidCore(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === '2embed.cc' || u.hostname.endsWith('.2embed.cc') || u.hostname === '2embed.skin' || u.hostname.endsWith('.2embed.skin');
  } catch {
    return false;
  }
}