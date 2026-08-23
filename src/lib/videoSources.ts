export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Fonte de reprodução para um título do catálogo.
 *
 * PLAYER ÚNICO: vidlink.pro (https://vidlink.pro)
 *   - Filmes   → https://vidlink.pro/movie/{tmdbId}
 *   - Séries   → https://vidlink.pro/tv/{tmdbId}/{season}/{episode}
 *   - Dublagem pt-BR: parâmetro `selectedLanguage=portuguese` — o player do
 *     vidlink seleciona automaticamente a faixa de áudio em português quando
 *     disponível (verificado no bundle oficial do player: o label da audio
 *     track é comparado com o valor do parâmetro).
 *   - Sem anúncios: parâmetro `limitAds=true` — desativa o overlay de anúncios
 *     do vidlink (verificado: com o parâmetro, zero iframes/overlays de ads
 *     no DOM). O popunder não é instanciado por padrão (enableDirectLinks=false).
 *   - O vidlink.pro NÃO envia header X-Frame-Options/CSP — pode ser embutido.
 *     Obs.: o atributo `sandbox` NÃO pode ser usado no iframe (o vidlink
 *     detecta e recusa carregar: "Please Disable Sandbox").
 */
export function getVideoSources(ids: VideoIds): string[] {
  const tipo =
    ids.mediaType === 'tv' || ids.mediaType === 'series' || ids.mediaType === 'anime'
      ? 'tv'
      : 'movie';

  const sources: string[] = [];

  if (tipo === 'movie' && ids.tmdbId != null) {
    sources.push(buildVidLinkUrl(`https://vidlink.pro/movie/${ids.tmdbId}`));
  } else if (tipo === 'tv' && ids.tmdbId != null) {
    // Séries: o PlayerPage monta a URL com temporada/episódio via getTvSource.
    sources.push(buildVidLinkUrl(`https://vidlink.pro/tv/${ids.tmdbId}/1/1`));
  } else if (ids.tmdbId != null) {
    sources.push(buildVidLinkUrl(`https://vidlink.pro/movie/${ids.tmdbId}`));
  }

  return sources;
}

/**
 * Monta a URL do vidlink.pro para um episódio específico de série.
 * Ex.: TMDB 1396 (Breaking Bad), temporada 1, episódio 1 →
 * https://vidlink.pro/tv/1396/1/1?autoplay=false&selectedLanguage=portuguese
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  return buildVidLinkUrl(`https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`);
}

/**
 * Aplica os parâmetros padrão do Movieflix à URL do vidlink.pro:
 *   - autoplay=false           → o usuário decide quando iniciar (evita bloqueio do navegador)
 *   - selectedLanguage=portuguese → força a faixa de áudio pt-BR (dublado) quando disponível
 *   - multiLang=true             → obrigatório! Faz a API do vidlink retornar
 *     MÚLTIPLAS faixas de áudio (multiLang=1). Sem este parâmetro o stream vem
 *     com UMA única faixa (geralmente inglês) e o selectedLanguage não tem o
 *     que selecionar — verificado no bundle oficial (page-movie.js): o player
 *     lê `multiLang=true` e chama a API com `multiLang=1`.
 *   - title=true                 → exibe o título no player
 *   - limitAds=true              → desativa o overlay de anúncios do vidlink
 */
export function buildVidLinkUrl(url: string): string {
  if (!url || !url.startsWith('https://vidlink.pro/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}autoplay=false&selectedLanguage=portuguese&multiLang=true&title=true&limitAds=true`;
}

/** Mantém compatibilidade com o resto do código que usa getVidsrcUrl. */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}

/**
 * ─── FONTES COM DUBLAGEM pt-BR GARANTIDA ────────────────────────────────
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
