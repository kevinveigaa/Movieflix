import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PosterCard } from './PosterCard';

interface Props {
  title: any;
  className?: string;
  forceType?: "movie" | "tv";
  mediaType?: "movie" | "tv";
}

export function PosterCardWithHistory({ title, className, forceType, mediaType }: Props) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!user || !title?.id) return;
    async function load() {
      const { data } = await supabase
        .from('watch_history')
        .select('position_seconds, duration_seconds')
        .eq('user_id', user.id)
        .eq('movie_id', title.id)
        .maybeSingle();
      if (data && data.duration_seconds > 0) {
        const pct = Math.min(100, Math.round((data.position_seconds / data.duration_seconds) * 100));
        setProgress(pct > 0 && pct < 100 ? pct : undefined);
      }
    }
    load();
  }, [user, title?.id]);

  return (
    <PosterCard
      title={title}
      className={className}
      forceType={forceType}
      mediaType={mediaType}
      progress={progress}
    />
  );
}
