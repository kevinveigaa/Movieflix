import { useQuery } from '@tanstack/react-query';

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
 * A query é cacheada e os JSON ficam no bundle (carregamento instantâneo,
 * sem depender de rede nem de Supabase para o catálogo).
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

async function loadJson(url: string): Promise<CatalogJson> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catálogo ${res.status}`);
  return res.json();
}

export function useMovies(type?: string) {
  return useQuery({
    queryKey: ['movies', 'catalog', type],
    queryFn: async () => {
      const [filmes, series] = await Promise.all([
        loadJson('/filmes/filmes.json'),
        loadJson('/filmes/series.json'),
      ]);
      const todos: CatalogMovie[] = [...filmes, ...series];

      let lista = todos;
      if (type === 'movie') lista = filmes;
      if (type === 'tv' || type === 'series') lista = series;

      return lista;
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

/** Somente filmes (atalho). */
export function useMoviesOnly() {
  return useQuery({
    queryKey: ['movies', 'catalog', 'movie'],
    queryFn: async () => loadJson('/filmes/filmes.json'),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

/** Somente séries (atalho). */
export function useSeriesOnly() {
  return useQuery({
    queryKey: ['movies', 'catalog', 'tv'],
    queryFn: async () => loadJson('/filmes/series.json'),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}
