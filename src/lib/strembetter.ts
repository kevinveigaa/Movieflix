/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STREAMBETTER — fonte oficial de filmes do Movieflix
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todos os filmes do catálogo agora vêm de https://streambetter.shop (API de
 * streaming com catálogo próprio e player embutível). Nada de players de
 * terceiros (vidlink.pro, megaembedapi, VidZee etc.) — o player do StreamBetter
 * é embutido DENTRO do site Movieflix, via <iframe>.
 *
 * ── Catálogo ────────────────────────────────────────────────────────────────
 *   GET https://streambetter.shop/api/titles?type=movie&limit=100&page=N
 *   → { success, titles: [{ id, tmdb_id, title, type, poster_path, overview }],
 *       pagination }
 *   A rota é pública e aceita CORS de qualquer domínio (confirmado na doc).
 *
 * ── Player embed ────────────────────────────────────────────────────────────
 *   Filmes : https://streambetter.shop/filme/{tmdb_id}?lang=pt-BR
 *   Séries : https://streambetter.shop/serie/{tmdb_id}/{temporada}/{episodio}
 *   O player resolve as fontes, legendas e fallbacks do outro lado.
 *
 * ── Áudio pt-BR ─────────────────────────────────────────────────────────────
 *   O player do StreamBetter seleciona automaticamente a faixa de áudio em
 *   português quando disponível (verificado no bundle do player: ele procura
 *   trilhas cujo lang começa com "pt"/"por" ou cujo nome contém "portug" e
 *   aplica como faixa padrão). Adicionamos `lang=pt-BR` na URL do embed como
 *   sinalizador de preferência — melhor esforço quando a fonte tem múltiplas
 *   faixas.
 *
 * ── Anúncios ────────────────────────────────────────────────────────────────
 *   O Movieflix não injeta nenhum anúncio próprio. O player embutido segue o
 *   player padrão do StreamBetter; para um embed 100% sem anúncios é preciso
 *   o plano Creator (chave sb_pk_* com trava de domínio) — ver
 *   https://streambetter.shop/planos. NÃO usamos sandbox/blockers no iframe
 *   (o StreamBetter detecta e recusa exibir o conteúdo).
 */

const STREAMBETTER_BASE = 'https://streambetter.shop';
const CATALOG_BASE = `${STREAMBETTER_BASE}/api/titles`;
const LIMITE_PAGINA = 100;

export interface StreamBetterTitle {
  id: number | string;
  tmdb_id: number | string;
  title: string;
  type?: string;
  poster_path?: string | null;
  overview?: string | null;
  updated_at?: string;
}

export interface StreamBetterPage {
  success: boolean;
  titles: StreamBetterTitle[];
  pagination?: {
    totalItems?: number;
    totalPages?: number;
    currentPage?: number;
    limit?: number;
  };
}

/** Parâmetro de preferência de idioma no embed (pt-BR). */
export const AUDIO_PTBR = 'pt-BR';

/**
 * Chave pública do plano Creator do StreamBetter (opcional).
 * Sem anúncios no embed: https://streambetter.shop/planos → Creator →
 * gere a chave sb_pk_* e cadastre o domínio do Movieflix. Defina
 * VITE_STREAMBETTER_KEY no build para ativá-la (a chave é pública por
 * natureza — vai na URL do iframe).
 */
const STREAMBETTER_KEY = (import.meta.env.VITE_STREAMBETTER_KEY as string) || '';

function withLangAndKey(url: string): string {
  const params = new URLSearchParams({ lang: AUDIO_PTBR });
  if (STREAMBETTER_KEY) params.set('key', STREAMBETTER_KEY);
  return `${url}?${params.toString()}`;
}

/** URL do player do StreamBetter para um filme, com áudio pt-BR preferido. */
export function streamBetterMovieUrl(tmdbId: number | string | null | undefined): string {
  if (tmdbId == null) return '';
  return withLangAndKey(`${STREAMBETTER_BASE}/filme/${tmdbId}`);
}

/** URL do player do StreamBetter para um episódio de série, com áudio pt-BR. */
export function streamBetterSeriesUrl(
  tmdbId: number | string | null | undefined,
  season: number,
  episode: number,
): string {
  if (tmdbId == null) return '';
  return withLangAndKey(`${STREAMBETTER_BASE}/serie/${tmdbId}/${season}/${episode}`);
}

/**
 * Busca uma página do catálogo de filmes do StreamBetter.
 * A rota é pública; aceita `page` (1-based) e `limit` (máx. 100).
 */
export async function fetchStreamBetterMovies(
  page = 1,
  limit = LIMITE_PAGINA,
): Promise<StreamBetterTitle[]> {
  const params = new URLSearchParams({
    type: 'movie',
    page: String(page),
    limit: String(Math.min(limit, LIMITE_PAGINA)),
  });

  const res = await fetch(`${CATALOG_BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`StreamBetter ${res.status}`);

  const data = (await res.json()) as StreamBetterPage;
  return data.titles ?? [];
}

/**
 * Busca todas as páginas do catálogo de filmes (até `maxPages` páginas).
 * Usada para popular o catálogo local do app (cache) sem depender de Supabase.
 */
export async function fetchAllStreamBetterMovies(maxPages = 10): Promise<StreamBetterTitle[]> {
  const todos: StreamBetterTitle[] = [];
  const vistos = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    let titulos: StreamBetterTitle[];
    try {
      titulos = await fetchStreamBetterMovies(page);
    } catch {
      break; // fim do catálogo ou rede indisponível — usa o que já temos
    }
    if (titulos.length === 0) break;

    for (const t of titulos) {
      const chave = String(t.tmdb_id);
      if (!vistos.has(chave)) {
        vistos.add(chave);
        todos.push(t);
      }
    }
    if (titulos.length < LIMITE_PAGINA) break;
  }

  return todos;
}

/**
 * Converte um título do StreamBetter no formato que o Movieflix espera
 * (mesma forma da antiga tabela `movies` do Supabase), com os campos
 * extras que as páginas usam (backdrop, votos etc. vêm do TMDb quando
 * houver; senão ficam vazios e a UI degrada com graça).
 */
export interface MovieflixMovie {
  id: string;
  title: string;
  description?: string | null;
  year?: string | null;
  poster_url?: string | null;
  backdrop_url?: string | null;
  video_url: string;
  vote_average?: number | null;
  category?: string | null;
  language: string;
  quality: string;
  type: string;
  tmdb_id: number | string;
  media_type?: 'movie';
}

export function toMovieflixMovie(t: StreamBetterTitle): MovieflixMovie {
  const tmdbId = t.tmdb_id;
  return {
    id: String(tmdbId),
    title: t.title ?? 'Sem título',
    description: t.overview ?? null,
    year: null,
    poster_url: t.poster_path ?? null,
    backdrop_url: null,
    video_url: streamBetterMovieUrl(tmdbId),
    vote_average: null,
    category: null,
    language: 'Dublado (pt-BR)',
    quality: 'HD',
    type: 'movie',
    tmdb_id: tmdbId,
    media_type: 'movie',
  };
}

/** Atalho: URL de embed do StreamBetter a partir de um filme do catálogo. */
export function movieEmbedUrl(movie: { video_url?: string; tmdb_id?: number | string } | null | undefined): string {
  if (!movie) return '';
  if (movie.video_url) return movie.video_url;
  return streamBetterMovieUrl(movie.tmdb_id);
}
