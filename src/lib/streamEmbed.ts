/**
 * StreamBetter Creator — EMBED OFICIAL (chave pública sb_pk_*).
 *
 * O MovieFlix usa o plano STREAMBETTER CREATOR, cuja credencial é a chave
 * PÚBLICA (sb_pk_*). A integração é feita pelo EMBED OFICIAL do provedor
 * (iframe), NÃO pela API de link direto (que exige o plano API / chave secreta
 * sb_sk_* e o endpoint /api/v1/stream).
 *
 * Este módulo é a ÚNICA fonte de verdade para montar a URL do embed. A chave
 * pública vem de VITE_STREAMBETTER_PUBLIC_KEY (variável de ambiente do build).
 * NUNCA coloque a chave diretamente em componentes — use buildStreamBetterUrl.
 *
 * URLs oficiais do Creator:
 *   - Filme : https://streambetter.shop/filme/{tmdb_id}?key=sb_pk_...
 *   - Série : https://streambetter.shop/serie/{tmdb_id}/{temporada}/{episodio}?key=sb_pk_...
 *   - Canal : https://streambetter.shop/canal/{nome}?key=sb_pk_...
 *
 * A chave pública NÃO é segredo (é feita para o embed no navegador). Ela é
 * injetada na URL para que o provedor reconheça a conta Creator e valide o
 * domínio cadastrado. NÃO use sb_pk_* como se fosse sb_sk_* (não funciona no
 * endpoint de API).
 */

const STREAMBETTER_BASE = 'https://streambetter.shop';

/**
 * Chave pública do plano Creator (sb_pk_*) do StreamBetter.
 * É uma chave PÚBLICA (feita para o embed no navegador) — não é segredo.
 * Vem de VITE_STREAMBETTER_PUBLIC_KEY (variável de ambiente do build); se a
 * variável não estiver presente no ambiente de build (ex.: Render), usamos
 * este fallback para garantir que o player sempre use a chave correta e fique
 * SEM anúncios (plano Creator pago).
 */
const STREAMBETTER_PUBLIC_KEY_FALLBACK =
  'sb_pk_19fe7c75a49585cd84ced96806703a2176768fa4f77a7ea4';

/** Chave pública do plano Creator (sb_pk_*). Vem do build (VITE_*) com fallback. */
export function chavePublicaStreamBetter(): string {
  return (
    (import.meta.env.VITE_STREAMBETTER_PUBLIC_KEY as string) ||
    STREAMBETTER_PUBLIC_KEY_FALLBACK
  );
}

/** A chave pública está configurada? (para avisar o admin se faltar) */
export function temChavePublicaStreamBetter(): boolean {
  return chavePublicaStreamBetter().length > 0;
}

/** Anexa a chave pública à URL do embed (se houver). */
function comChave(url: string): string {
  const key = chavePublicaStreamBetter();
  if (!key) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}key=${encodeURIComponent(key)}`;
}

/**
 * Monta a URL do embed oficial do StreamBetter para um FILME.
 * Ex.: https://streambetter.shop/filme/550?key=sb_pk_...
 */
export function buildStreamBetterMovieUrl(tmdbId: number | string | null | undefined): string {
  if (tmdbId == null) return '';
  return comChave(`${STREAMBETTER_BASE}/filme/${tmdbId}`);
}

/**
 * Monta a URL do embed oficial do StreamBetter para um EPISÓDIO de série.
 * Ex.: https://streambetter.shop/serie/1396/1/1?key=sb_pk_...
 */
export function buildStreamBetterSeriesUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
): string {
  if (tmdbId == null) return '';
  return comChave(`${STREAMBETTER_BASE}/serie/${tmdbId}/${season}/${episode}`);
}

/**
 * Monta a URL do embed oficial do StreamBetter para um CANAL (conteúdo ao vivo).
 * Ex.: https://streambetter.shop/canal/{nome}?key=sb_pk_...
 */
export function buildStreamBetterChannelUrl(nome: string | null | undefined): string {
  if (!nome) return '';
  return comChave(`${STREAMBETTER_BASE}/canal/${encodeURIComponent(nome)}`);
}

/** É uma URL de embed do StreamBetter? */
export function ehEmbedStreamBetter(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'streambetter.shop' || u.hostname.endsWith('.streambetter.shop');
  } catch {
    return false;
  }
}