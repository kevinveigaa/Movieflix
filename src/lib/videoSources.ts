export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Fontes de reprodução para um título do catálogo, em ordem de preferência.
 *
 * Histórico do que descobrimos testando os provedores (ago/2026, navegador real):
 * - `vidsrc.cc/v2` retorna HTTP 522/403 e nunca reproduz — descartado.
 * - `vidsrc.to/embed/...` retorna 200, mas o player interno (vsembed.ru) abre
 *   em tela preta sem reproduzir em vários títulos — falha na prática.
 * - `vidsrc.me/embed/...` é o MESMO player do vsembed.ru (mesmo HTML/JS) e
 *   sofre do mesmo problema.
 * - `2embed.cc/embed/{tmdb_id}` redireciona para uma página de seleção de
 *   servidor (não reproduz direto em iframe).
 * - `multiembed.mov` / `superembed.stream` ficam presos num challenge
 *   Cloudflare ("Verify you are human") — inviáveis em iframe.
 * - `vidsrc.xyz`, `embed.su`, `vidsrc.net`, `moviesapi.club`, `embed.embedbam.com`
 *   não resolvem DNS / estão fora do ar.
 * - `player.vidzee.wtf/embed/movie/{tmdb_id}` FUNCIONA: reproduz o filme real
 *   (testado com The Matrix TMDB 603 — vídeo carregou com readyState=4 e
 *   duração de 2h16min, autoplay silenciado) e séries
 *   (testado com Breaking Bad TMDB 1396 S1E1 — 58min). Envia
 *   `Content-Security-Policy: frame-ancestors *` e `X-Frame-Options: SAMEORIGIN`,
 *   portanto pode ser embutido em iframe de qualquer site.
 *
 * Por isso a ordem é: video_url do banco (agora VidZee) → vidsrc.to → 2embed.cc → vidsrc.me.
 * A troca automática entre elas acontece no PlayerPage (onLoad/timeout).
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
      // Provedor principal: VidZee — reproduz filmes/séries de verdade.
      sources.push(`https://player.vidzee.wtf/embed/movie/${ids.tmdbId}`);
    } else if (ids.tmdbId && tipo === 'tv') {
      // Séries: o PlayerPage monta a URL com temporada/episódio via getTvSource.
      sources.push(`https://player.vidzee.wtf/embed/tv/${ids.tmdbId}/1/1`);
    } else if (typeof id === 'string' && id.startsWith('tt')) {
      sources.push(`https://player.vidzee.wtf/embed/movie/${id}`);
    }

    // Fallbacks (mantidos para robustez)
    sources.push(
      `https://vidsrc.to/embed/${tipo}/${id}`,
      `https://2embed.cc/embed/${id}`,
      `https://vidsrc.me/embed/${tipo}/${id}`,
    );
  }

  return sources;
}

/**
 * Monta a URL do VidZee para um episódio específico de série.
 * Ex.: TMDB 1396 (Breaking Bad), temporada 1, episódio 1 →
 * https://player.vidzee.wtf/embed/tv/1396/1/1
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  return `https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`;
}

/**
 * Mantém compatibilidade com o resto do código que usa getVidsrcUrl:
 * devolve a primeira fonte da cascata (ou null se não houver IDs).
 */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}
