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
      // Aplica os hints de pt-BR (melhor esforço; veja applyPtBrHints abaixo).
      sources.push(applyPtBrHints(`https://player.vidzee.wtf/embed/movie/${ids.tmdbId}`));
    } else if (ids.tmdbId && tipo === 'tv') {
      // Séries: o PlayerPage monta a URL com temporada/episódio via getTvSource.
      sources.push(applyPtBrHints(`https://player.vidzee.wtf/embed/tv/${ids.tmdbId}/1/1`));
    } else if (typeof id === 'string' && id.startsWith('tt')) {
      sources.push(applyPtBrHints(`https://player.vidzee.wtf/embed/movie/${id}`));
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
 *
 * 🔬 REINVESTIGAÇÃO PROFUNDA (2026-08-22) — limitação 100% confirmada:
 * Foram testados na prática, contra o player real (não apenas lendo o código):
 *   1. Parâmetros de query na URL do embed (?lang=pt-BR, ?audio=pt, ?sub=pt,
 *      ?dub=1, ?language=pt...) — IGNORADOS: o player carrega exatamente as
 *      mesmas chamadas de API e o mesmo blob de vídeo com ou sem eles.
 *   2. API oficial do backend (core.vidzee.wtf/streams/movie|tv/{id}?s=...):
 *      o campo "language" da resposta é SEMPRE "Auto", mesmo passando
 *      &language=pt-BR / &lang=pt / &audio=pt / &dub=1 — o backend decide
 *      a trilha de áudio sozinho.
 *   3. Menu de Configurações do player: só existe troca de SERVIDOR
 *      (Dcloud / TCloud / IPcloud / Hindi v3) — NÃO existe seletor de faixa
 *      de áudio/idioma de dublagem.
 *   4. localStorage do player: só guarda preferências de UI (autoplay,
 *      volume, estilo de legenda) — nenhuma chave de idioma de áudio.
 *   5. postMessage: o player NÃO expõe nenhuma API de postMessage para o
 *      host trocar faixa de áudio/legenda.
 * Conclusão: é tecnicamente IMPOSSÍVEL forçar a dublagem pt-BR dentro do
 * iframe do VidZee a partir do código do Movieflix. Por isso o app envia
 * "hints" (?lang=pt-BR&audio=pt-BR&sub=pt-BR&dub=1) nas URLs — inofensivos
 * hoje (são ignorados) e à prova de futuro caso o VidZee passe a aceitá-los.
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  // Aplica os hints de pt-BR (melhor esforço; veja applyPtBrHints acima).
  return applyPtBrHints(`https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`);
}

/**
 * Mantém compatibilidade com o resto do código que usa getVidsrcUrl:
 * devolve a fonte 1 (ou null se não houver IDs).
 */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}

/**
 * Aplica "hints" de pt-BR (dublagem) à URL de embed do VidZee.
 *
 * ⚠️ IMPORTANTE: hoje o VidZee IGNORA esses parâmetros (verificado em
 * 2026-08-22 contra o player real e a API core.vidzee.wtf — o campo
 * "language" da resposta é sempre "Auto"). Eles NÃO quebram o player
 * (a URL continua válida) e servem como sinalização de melhor esforço:
 * se um dia o VidZee passar a aceitar idioma via URL, o Movieflix já
 * estará enviando o pedido de pt-BR automaticamente.
 */
export function applyPtBrHints(url: string): string {
  if (!url || !url.startsWith('https://player.vidzee.wtf/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}lang=pt-BR&audio=pt-BR&sub=pt-BR&dub=1`;
}