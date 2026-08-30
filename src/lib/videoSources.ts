import { streambetterMovieEmbedUrl, streambetterSeriesEmbedUrl } from '@/lib/strembetter';

export type VideoIds = {
  imdbId?: string | null;
  tmdbId?: string | number | null;
  mediaType?: string | null;
};

/**
 * Fonte de reprodução para um título do catálogo.
 *
 * PLAYER ÚNICO: CineSrc (https://cinesrc.st)
 *   - Filmes → https://cinesrc.st/embed/movie/{tmdbId}?lang=pt-BR
 *   - Séries → https://cinesrc.st/embed/tv/{tmdbId}?s={season}&e={episode}&lang=pt-BR
 *
 * O player é embutido DENTRO do site Movieflix via <iframe> (ver PlayerPage).
 * Áudio pt-BR: o player do CineSrc seleciona automaticamente a faixa em
 * português quando disponível; `lang=pt-BR` reforça a preferência.
 *
 * NENHUM player de terceiros (vidlink.pro, megaembedapi, VidZee, VidCore) é
 * usado — todo o catálogo foi migrado para o CineSrc.
 */
export function getVideoSources(ids: VideoIds): string[] {
  const tipo =
    ids.mediaType === 'tv' || ids.mediaType === 'series'
      ? 'tv'
      : 'movie';

  const sources: string[] = [];

  if (ids.tmdbId != null) {
    if (tipo === 'tv') {
      sources.push(streambetterSeriesEmbedUrl(ids.tmdbId, 1, 1));
    } else {
      sources.push(streambetterMovieEmbedUrl(ids.tmdbId));
    }
  }

  return sources;
}

/**
 * Monta a URL do CineSrc para um episódio específico de série.
 * Ex.: TMDB 1396 (Breaking Bad), temporada 1, episódio 1 →
 * https://cinesrc.st/embed/tv/1396?s=1&e=1&lang=pt-BR
 */
export function getTvSource(tmdbId: string | number | null, season: number, episode: number): string {
  if (tmdbId == null) return '';
  return streambetterSeriesEmbedUrl(tmdbId, season, episode);
}

/** Mantém compatibilidade com o resto do código que usa getVidsrcUrl. */
export function getVidsrcUrl(ids: VideoIds): string | null {
  const sources = getVideoSources(ids);
  return sources.length > 0 ? sources[0] : null;
}

/**
 * ── Fontes legadas removidas ────────────────────────────────────────────────
 * Este arquivo costumava ter o builder do vidlink.pro (com selectedLanguage,
 * multiLang, limitAds), o normalizador de YouTube/Drive/MP4 dublado e o
 * suporte a megaembedapi. Tudo isso foi substituído pelo player único do
 * StreamBetter, que resolve fontes, legendas, áudio pt-BR e fallbacks.
 *
 * As funções abaixo continuam exportadas por compatibilidade com código
 * antigo, mas sempre devolvem o embed do StreamBetter (ou null).
 */

/** Extrai o ID de qualquer URL do YouTube. Mantido por compatibilidade. */
export function getYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  return m ? m[1] : null;
}

/** Mantido por compatibilidade — devolve a URL original (não usamos YouTube direto). */
export function youtubeEmbedUrl(url: string): string | null {
  const id = getYoutubeId(url);
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?hl=pt-BR&cc_lang_pref=pt-BR&rel=0&modestbranding=1`;
}

/** É uma URL de vídeo direto (MP4/MKV/WEBM/M4V/OGV ou HLS .m3u8)? Mantido por compatibilidade. */
export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|mkv|webm|m4v|ogv|mov)(\?|#|$)/i.test(url) || /\.m3u8(\?|#|$)/i.test(url);
}

/** É um embed/preview do Google Drive? Mantido por compatibilidade. */
export function isDriveUrl(url: string): boolean {
  return /drive\.google\.com\/(file|open|uc)/i.test(url);
}

/** Normaliza um preview do Google Drive para a forma embutível /preview. Mantido por compatibilidade. */
export function drivePreviewUrl(url: string): string | null {
  const m = url.match(/[?&]id=([A-Za-z0-9_-]+)|\/d\/([A-Za-z0-9_-]+)/);
  const id = m ? (m[1] || m[2]) : null;
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/**
 * Normaliza uma URL de fonte para a melhor forma de reprodução.
 * Com o StreamBetter como fonte única, retorna 'iframe' para URLs do
 * StreamBetter e null para o resto (segue o iframe genérico do PlayerPage).
 */
export function normalizeDubbedSource(url: string): { kind: 'youtube' | 'drive' | 'direct' | 'iframe'; url: string } | null {
  if (!url) return null;
  if (url.includes('streambetter.shop')) return { kind: 'iframe', url };
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