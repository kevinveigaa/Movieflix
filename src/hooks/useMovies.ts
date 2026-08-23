import { useQuery } from '@tanstack/react-query';
import {
  fetchAllStreamBetterMovies,
  toMovieflixMovie,
  type MovieflixMovie,
} from '@/lib/strembetter';

/**
 * Catálogo de filmes do Movieflix — agora 100% vindo do StreamBetter.
 *
 * Antes este hook lia a tabela `movies` do Supabase (com `video_url` de
 * players de terceiros: megaembedapi, vidlink.pro etc.). Agora o catálogo é
 * buscado ao vivo da API pública do StreamBetter e convertido para o formato
 * que as páginas do app já esperam. Sem anúncios próprios, sem embeds de
 * terceiros: o player é sempre o do StreamBetter, embutido no site.
 *
 * A query é cacheada por 10 minutos (o catálogo do StreamBetter muda em
 * horas, não em segundos — recomendação oficial da doc).
 */
export function useMovies(type?: string) {
  return useQuery({
    queryKey: ['movies', 'strembetter', type],
    queryFn: async () => {
      const titles = await fetchAllStreamBetterMovies(10);

      let lista: MovieflixMovie[] = titles.map(toMovieflixMovie);

      if (type) {
        lista = lista.filter((m) => m.type === type);
      }

      return lista;
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}
