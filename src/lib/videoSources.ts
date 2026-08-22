export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Fontes de reprodução para um título do catálogo, em ordem de preferência.
 *
 * Histórico do que descobrimos testando os provedores (ago/2026):
 * - `vidsrc.cc/v2` retorna HTTP 522/403 e nunca reproduz — descartado.
 * - `vidsrc.to/embed/...` retorna 200, mas o player interno (vsembed.ru) abre
 *   em tela branca sem elemento <video> em vários títulos — falha na prática.
 * - `vidsrc.me/embed/...` é o MESMO player do vsembed.ru (mesmo HTML/JS) e
 *   sofre do mesmo problema quando o stream não é encontrado.
 * - `2embed.cc/embed/{tmdb_id}` retorna 200 com o título correto e stream
 *   real (streamsrcs.2embed.cc). Ele só bloqueia quando é aberto como janela
 *   top-level (script anti-framing faz location.replace); dentro de um iframe
 *   da nossa página o anti-framing não dispara.
 *
 * Teste visual em iframe (navegador real, ago/2026) confirmou que:
 * - `2embed.cc/embed/{tmdb_id}` renderiza o player corretamente DENTRO de
 *   iframe (poster + play + título), porque o anti-framing só dispara quando
 *   a página é aberta como janela top-level.
 * - `vidsrc.me` (e o vsembed.ru do vidsrc.to) renderiza parcialmente/em
 *   branco no mesmo contexto.
 *
 * Por isso a ordem é: video_url do banco → 2embed.cc → vidsrc.me → vidsrc.to.
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
    sources.push(
      `https://2embed.cc/embed/${id}`,
      `https://vidsrc.me/embed/${tipo}/${id}`,
      `https://vidsrc.to/embed/${tipo}/${id}`,
    );
  }

  return sources;
}

/**
 * Mantém compatibilidade com o resto do código que usa getVidsrcUrl:
 * devolve a primeira fonte da cascata (ou null se não houver IDs).
 */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}
