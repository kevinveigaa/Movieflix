import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  montarDisponibilidade,
  episodiosComVideo,
  temVideoDisponivel,
  type DisponibilidadeJson,
} from '@/lib/disponibilidade';

/**
 * Catálogo do Movieflix — carregado de JSON estáticos gerados por
 * `node gerar-catalogo.cjs` (filmes/filmes.json + filmes/series.json).
 *
 * Regras aplicadas na geração (ver gerar-catalogo.cjs):
 *  - Somente Filmes e Séries (animes removidos);
 *  - Somente títulos com capa (poster);
 *  - Somente títulos dublados em pt-BR (player StreamBetter seleciona faixa pt);
 *  - Somente títulos com fonte cadastrada (séries com ≥1 episódio);
 *  - Zero anúncios próprios.
 *
 * PERFORMANCE:
 *  - UMA ÚNICA query canônica ("catalog" = filmes + séries). useMovies(),
 *    useMoviesOnly() e useSeriesOnly() são views derivadas via useMemo —
 *    NUNCA disparam um segundo fetch, eliminando downloads duplicados (~4.5MB).
 *  - Cache em localStorage (mf_catalog_v2): na segunda visita o catálogo
 *    renderiza INSTANTANEAMENTE (zero rede); o fetch silencioso valida o cache.
 *  - single-flight: chamadas concorrentes dividem a MESMA Promise.
 */
export interface CatalogMovie {
  id: string;
  title: string;
  description?: string | null;
  poster_url?: string | null;
  backdrop_url?: string | null;
  video_url?: string;
  vote_average?: number | null;
  category?: string | null;
  language?: string | null;
  quality?: string | null;
  type?: string | null;
  media_type?: 'movie' | 'tv';
  tmdb_id?: number | string;
  year?: string | null;
  duration?: number | null;
  seasons?: number | null;
  episodes?: number | null;
  episodes_available?: string[];
  dublado_ptbr?: boolean;
}

type CatalogJson = CatalogMovie[];

interface CacheEnvelope {
  savedAt: number;
  filmes: CatalogJson;
  series: CatalogJson;
}

const CACHE_KEY = 'mf_catalog_v5';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h

function readCache(): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!Array.isArray(parsed?.filmes) || !Array.isArray(parsed?.series)) return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(filmes: CatalogJson, series: CatalogJson) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), filmes, series } satisfies CacheEnvelope));
  } catch {
    /* storage cheio / privado: segue sem cache */
  }
}

/** single-flight: todas as chamadas simultâneas dividem a MESMA Promise. */
let inFlight: Promise<CacheEnvelope> | null = null;

async function loadCatalog(): Promise<CacheEnvelope> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const cache = readCache();
    if (cache) return cache;

    const [filmesBrutos, seriesBrutas, disponibilidadeJson] = await Promise.all([
      fetch('/filmes/filmes.json').then((r) => {
        if (!r.ok) throw new Error(`Catálogo ${r.status}`);
        return r.json() as Promise<CatalogJson>;
      }),
      fetch('/filmes/series.json').then((r) => {
        if (!r.ok) throw new Error(`Catálogo ${r.status}`);
        return r.json() as Promise<CatalogJson>;
      }),
      // UMA requisição para todo o catálogo (não uma por título).
      fetch('/filmes/disponibilidade.json')
        .then((r) => (r.ok ? (r.json() as Promise<DisponibilidadeJson>) : null))
        .catch(() => null),
    ]);

    // Só entra no catálogo público quem tem vídeo bom e reproduzível.
    // Nada é apagado dos JSONs — apenas não é exibido enquanto não houver vídeo.
    const disp = montarDisponibilidade(disponibilidadeJson);
    const filmes = filmesBrutos.filter((f) => temVideoDisponivel(f, disp));
    const series = seriesBrutas
      .map((s) => {
        const eps = episodiosComVideo(s, disp);
        return eps === s.episodes_available ? s : { ...s, episodes_available: eps };
      })
      .filter((s) => temVideoDisponivel(s, disp));

    writeCache(filmes, series);
    return { savedAt: Date.now(), filmes, series };
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

const ALL_KEY = ['movies', 'catalog', 'all'] as const;

/** Query canônica do catálogo completo (filmes + séries), cacheada e single-flight. */
function useCatalogAll() {
  return useQuery({
    queryKey: ALL_KEY,
    queryFn: loadCatalog,
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    // O cache em localStorage cobre a primeira pintura; enquanto a rede
    // valida, a UI já mostra o catálogo (sem flash de loading).
    placeholderData: () => readCache() ?? undefined,
  });
}

/**
 * Catálogo (view por tipo). `type`:
 *  - undefined → filmes + séries
 *  - 'movie'   → só filmes
 *  - 'tv'|'series' → só séries
 */
export function useMovies(type?: string) {
  const q = useCatalogAll();
  const data = useMemo(() => {
    if (!q.data) return undefined;
    if (type === 'movie') return q.data.filmes;
    if (type === 'tv' || type === 'series') return q.data.series;
    return [...q.data.filmes, ...q.data.series];
  }, [q.data, type]);
  return { ...q, data };
}

/** Somente filmes (view derivada — sem fetch extra). */
export function useMoviesOnly() {
  const q = useCatalogAll();
  const data = useMemo(() => q.data?.filmes, [q.data]);
  return { ...q, data };
}

/** Somente séries (view derivada — sem fetch extra). */
export function useSeriesOnly() {
  const q = useCatalogAll();
  const data = useMemo(() => q.data?.series, [q.data]);
  return { ...q, data };
}
