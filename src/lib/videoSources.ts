export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Fonte de reprodução para um título do catálogo.
 *
 * Apenas UMA fonte é usada (fonte 1): o provedor VidZee, que foi validado
 * e funciona (filmes e séries reproduzem de verdade em iframe, com
 * `Content-Security-Policy: frame-ancestors *`).
 *
 * Os demais provedores (vidsrc.to, vidsrc.me, 2embed.cc etc.) foram
 * testados e descartados — falhavam na prática (tela preta, HTTP 522/403,
 * challenge Cloudflare, servidor de seleção etc.). Por isso a cascata de
 * fallback foi REMOVIDA: o player usa somente esta fonte.
 */
export function getVideoSources(ids: VideoIds): string[] {
  const tipo =
    ids.mediaType === 'tv' || ids.mediaType === 'series' || ids.mediaType === 'anime'
      ? 'tv'
      : 'movie';

  const id = ids.imdbId || ids.tmdbId;
  const sources: string[] = [];

  if (id) {
    if (ids.tmdbId && tipo === 'movie') {
      // Fonte 1 (única): VidZee — reproduz filmes de verdade.
      sources.push(`https://player.vidzee.wtf/embed/movie/${ids.tmdbId}`);
    } else if (ids.tmdbId && tipo === 'tv') {
      // Séries: o PlayerPage monta a URL com temporada/episódio via getTvSource.
      sources.push(`https://player.vidzee.wtf/embed/tv/${ids.tmdbId}/1/1`);
    } else if (typeof id === 'string' && id.startsWith('tt')) {
      sources.push(`https://player.vidzee.wtf/embed/movie/${id}`);
    }
    // Nenhuma outra fonte/fallback — apenas a fonte 1.
  }

  return sources;
}

/**
 * Monta a URL do VidZee para um episódio específico de série.
 * Ex.: TMDB 1396 (Breaking Bad), temporada 1, episódio 1 →
 * https://player.vidzee.wtf/embed/tv/1396/1/1
 *
 * ⚠️ LIMITAÇÃO CONFIRMADA (áudio/dublagem):
 * A API pública do VidZee (player.vidzee.wtf) NÃO expõe nenhum parâmetro de
 * URL para idioma/áudio/legenda. Os endpoints documentados são apenas:
 *   /embed/movie/{tmdb_id}
 *   /embed/tv/{tmdb_id}/{season}/{episode}
 *   /v2/embed/movie/{tmdb_id}  e  /v2/embed/tv/{tmdb_id}/{season}/{episode}
 * (verificado por inspeção dos bundles JS oficiais do player/site — não há
 * ?lang=, ?lng=, ?audio=, ?sub= nem ?dub=).
 *
 * Isso significa que a trilha de áudio efetivamente reproduzida é decidida
 * 100% pelo backend do VidZee (terceiro), fora do alcance deste código.
 * O que este projeto consegue (e faz) para garantir pt-BR:
 *   - Catálogo/admin/importação rotulam os títulos como "Dublado (pt-BR)"
 *     (padrão em AdminPage e em todos os scripts de importação);
 *   - Todas as consultas à TMDb usam language=pt-BR (tmdbFetch, proxy do
 *     backend e scripts), garantindo que o conteúdo exibido seja o BR;
 *   - O proxy do player envia Accept-Language: pt-BR ao upstream.
 * Dentro do player do VidZee o usuário ainda pode trocar manualmente a faixa
 * de áudio/legenda, mas não há como forçar via URL a partir do Movieflix.
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  return `https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`;
}

/**
 * Mantém compatibilidade com o resto do código que usa getVidsrcUrl:
 * devolve a fonte 1 (ou null se não houver IDs).
 */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}
