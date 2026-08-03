import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useMovies(type?: string) {
  return useQuery({
    queryKey: ['movies', type],
    queryFn: async () => {
      let query = supabase
        .from('movies')
        .select('*')
        .order('created_at', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw error;

      console.log('FILMES SUPABASE:', data); console.log('PRIMEIRO FILME COMPLETO:', data?.[0]);

      return data;
    },
  });
}






