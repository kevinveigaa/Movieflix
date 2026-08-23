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
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  // Aplica os hints de pt-BR (melhor esforço; veja applyPtBrHints acima).
  return applyPtBrHints(`https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`);
}

/**
 * ─── FONTES COM DUBLAGEM pt-BR GARANTIDA ───────────────────────────────────
 * Quando o `video_url` do banco aponta para uma fonte cujo ÁUDIO JÁ É dublado
 * em pt-BR (vídeo do YouTube "Filme Completo em Português", MP4/HLS dublado,
 * preview do Google Drive), o PlayerPage renderiza um player adequado:
 *   - YouTube        → iframe oficial youtube-nocookie com hl=pt-BR
 *   - MP4/HLS direto → <video> nativo + hls.js
 *   - Google Drive   → iframe de preview (o áudio vem embutido no arquivo)
 * Essas fontes NÃO dependem de backend de terceiros para escolher o idioma:
 * a dublagem já está no próprio arquivo/stream.
 */

/** Extrai o ID de qualquer URL do YouTube (watch, youtu.be, embed, shorts). */
export function getYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  return m ? m[1] : null;
}

/** Converte qualquer URL do YouTube no embed oficial com idioma pt-BR. */
export function youtubeEmbedUrl(url: string): string | null {
  const id = getYoutubeId(url);
  if (!id) return null;
  const params = new URLSearchParams({
    hl: 'pt-BR',
    cc_lang_pref: 'pt-BR',
    rel: '0',
    modestbranding: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** É uma URL de vídeo direto (MP4/MKV/WEBM/M4V/OGV ou HLS .m3u8)? */
export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|mkv|webm|m4v|ogv|mov)(\?|#|$)/i.test(url) || /\.m3u8(\?|#|$)/i.test(url);
}

/** É um embed/preview do Google Drive? */
export function isDriveUrl(url: string): boolean {
  return /drive\.google\.com\/(file|open|uc)/i.test(url);
}

/** Normaliza um preview do Google Drive para a forma embutível /preview. */
export function drivePreviewUrl(url: string): string | null {
  const m = url.match(/[?&]id=([A-Za-z0-9_-]+)|\/d\/([A-Za-z0-9_-]+)/);
  const id = m ? (m[1] || m[2]) : null;
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/**
 * Normaliza o `video_url` do banco para a melhor forma de reprodução.
 * Retorna null se a URL não precisar de normalização (segue o iframe genérico).
 */
export function normalizeDubbedSource(url: string): { kind: 'youtube' | 'drive' | 'direct'; url: string } | null {
  if (!url) return null;
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const emb = youtubeEmbedUrl(url);
    return emb ? { kind: 'youtube', url: emb } : null;
  }
  if (isDriveUrl(url)) {
    const pv = drivePreviewUrl(url);
    return pv ? { kind: 'drive', url: pv } : null;
  }
  if (isDirectVideoUrl(url)) {
    return { kind: 'direct', url };
  }
  return null;
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