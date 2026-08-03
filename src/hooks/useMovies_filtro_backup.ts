import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useMovies() {
  return useQuery({
    queryKey: ['movies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movies')
        .select('*')
        .eq('language', 'Dublado')
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('FILMES SUPABASE:', data);

      return data;
    },
  });
}


