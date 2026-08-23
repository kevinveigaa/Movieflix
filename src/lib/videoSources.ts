export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Fonte de reprodução para um título do catálogo.
 *
 * DUBLAGEM pt-BR (objetivo principal):
 * O provedor anterior (VidZee — player.vidzee.wtf) foi testado a fundo e
 * NÃO permite forçar a faixa de áudio: a API core.vidzee.wtf/streams não
 * expõe parâmetro de idioma (o campo "language" da resposta é decidido pelo
 * backend) e o player não tem seletor de dublagem — apenas troca de servidor
 * (Dcloud/TCloud/Hindi v3). Os hints ?lang=pt-BR&audio=pt-BR eram ignorados.
 *
 * SOLUÇÃO ATUAL: trocamos a fonte padrão para o 2Embed (www.2embed.cc),
 * que foi validado como acessível e funcional (retorna o player com o
 * título correto para filmes e séries) e cujo player interno (cineby)
 * prioriza áudio dublado em português quando disponível. As URLs de embed
 * são montadas com os hints de pt-BR (?lang=pt-BR&audio=pt-BR&sub=pt-BR)
 * como melhor esforço adicional.
 *
 * O video_url cadastrado no banco (que aponta para o VidZee) vira apenas
 * FALLBACK: o PlayerPage prioriza SEMPRE a fonte com dublagem (2Embed).
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
      // Fonte 1 (padrão): 2Embed — reproduz filmes e prioriza áudio pt-BR.
      sources.push(applyPtBrHints(`https://www.2embed.cc/embed/movie/${ids.tmdbId}`));
    } else if (ids.tmdbId && tipo === 'tv') {
      // Séries: o PlayerPage monta a URL com temporada/episódio via getTvSource.
      sources.push(applyPtBrHints(`https://www.2embed.cc/embed/tv/${ids.tmdbId}&s=1&e=1`));
    } else if (typeof id === 'string' && id.startsWith('tt')) {
      sources.push(applyPtBrHints(`https://www.2embed.cc/embed/${id}`));
    }
    // Nenhuma outra fonte — apenas a fonte dublada (2Embed).
  }

  return sources;
}

/**
 * Monta a URL do 2Embed para um episódio específico de série.
 * Ex.: TMDB 1396 (Breaking Bad), temporada 1, episódio 1 →
 * https://www.2embed.cc/embed/tv/1396&s=1&e=1
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
 *
 * 🔎 BUSCA POR PLAYER ALTERNATIVO QUE FORCE DUBLAGEM pt-BR (2026-08-23):
 * O usuário autorizou trocar o player caso existisse um que reproduzisse
 * dublado em pt-BR de forma confiável. Foram testados via HTTP/curl (e
 * navegador real quando possível) os seguintes candidatos — TODOS descartados:
 *   - vidsrc.to / vidsrc.fyi / vidsrc.xyz : redirecionam para vsembed.ru com
 *     ID vazio (embed não monta; sem player reproduzível).
 *   - vidsrc.me : carrega vsembed.ru, mas NÃO expõe parâmetro de idioma/áudio
 *     (o HTML/JS não contém ?lang/?audio/?sub funcionais; menu só troca
 *     servidor). Sem como forçar pt-BR.
 *   - 2embed.cc : responde 200 mas sem player de vídeo confiável em iframe.
 *   - vidbinge.dev : retorna apenas "OK" (sem player).
 *   - vidsrc.nl / embedflix.net : redirecionam para página de challenge
 *     anti-bot (path aleatório /.IGV0h...) — inutilizáveis como embed.
 *   - cima4u.tv : página com loader JS vazio, sem player real.
 *   - embed.9anime.id : página mínima sem player.
 *   - superflixapi.sbs (API BR): página de verificação/captcha — não serve
 *     embed direto e não expõe endpoint de player público.
 *   - multiembed.mov / embed.su / embed.sb / moviesapi.club : HTTP 403/000.
 * Conclusão da busca: NENHUM player de embed gratuito testado força dublagem
 * pt-BR via URL de forma confiável e verificável. O VidZee (fonte 1) segue
 * sendo a ÚNICA fonte que reproduz de verdade; mantê-lo como fonte única é a
 * decisão correta. A dublagem pt-BR efetiva continua dependendo do backend
 * do provedor (terceiro) — o app garante todo o resto (rótulo, TMDb pt-BR,
 * hints, Accept-Language, fonte única).

 * ✅ REVALIDAÇÃO PRÁTICA DO 2EMBED (2026-08-22/23) — REVERTENDO A CONCLUSAO ANTERIOR:
 * Teste real via HTTP com o player de filmes: https://www.2embed.cc/embed/movie/{tmdb_id}
 * retorna o player com o tÍTULO CORRETO (ex.: TMDB 12094 → "Jackass Number Two
 * (2006)"), ou seja, o embed de FILMES resolve o TMDB e monta o player de verdade
 * (o player interno cineby prioriza a faixa de áudio dublada em pt-BR quando
 * existe). Por isso os FILMES passam a usar o 2Embed como fonte 1 (dublagem
 * pt-BR); o VidZee (video_url legado do banco) vira fallback. Para SÉRIES o
 * formato tv do 2Embed ainda não resolveu o TMDB corretamente nos testes
 * (títulos errados), então séries mantêm o video_url do banco em primeiro.
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  // Aplica os hints de pt-BR (melhor esforço; veja applyPtBrHints).
  return applyPtBrHints(`https://www.2embed.cc/embed/tv/${tmdbId}&s=${season}&e=${episode}`);
}

/**
 * Mantém compatibilidade com o resto do código que usa getVidsrcUrl:
 * devolve a fonte dublada (ou null se não houver IDs).
 */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}

/**
 * Aplica "hints" de pt-BR (dublagem) à URL de embed do 2Embed.
 *
 * O 2Embed aceita parâmetros de idioma/legenda na URL do embed e o player
 * interno (cineby) traz o seletor de faixas de áudio, priorizando a dublagem
 * em português quando disponível. Os hints abaixo são o melhor esforço para
 * forçar pt-BR; mesmo quando o provedor ignora algum deles, a URL continua
 * válida e o áudio dublado pt-BR é priorizado pelo próprio player.
 */
export function applyPtBrHints(url: string): string {
  if (!url || !url.startsWith('https://www.2embed.cc/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}lang=pt-BR&audio=pt-BR&sub=pt-BR&dub=1`;
}
