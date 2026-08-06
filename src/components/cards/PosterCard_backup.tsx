import { Link } from 'react-router-dom';
import { Play, Plus, Check } from 'lucide-react';
import { useFavorite } from '@/hooks/useFavorite';
import { cn } from '@/lib/cn';

interface MovieCardProps {
  title: any;
  className?: string;
  forceType?: 'movie' | 'tv';
}

export function PosterCard({ title, className, forceType }: MovieCardProps) {

  console.log("CARD MOVIE:", title);

  const { isFavorite, toggle } = useFavorite(
    title.id,
    forceType ?? (title.type === 'tv' ? 'tv' : 'movie')
  );

  return (
    <Link
      to={`/assistir/${title.id}`}
      className={cn(
        'group relative block w-[150px] flex-shrink-0 sm:w-[180px]',
        className
      )}
    >

      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 transition duration-300 group-hover:-translate-y-1">

        <img
  src={
    title.poster_url
      ? title.poster_url
      : title.poster_path
        ? `https://image.tmdb.org/t/p/w500${title.poster_path}`
        : title.video_url
          ? `https://img.youtube.com/vi/${title.video_url.split("v=")[1]}/hqdefault.jpg`
          : "/placeholder.jpg"
  }
  alt={title.title}
  loading="lazy"
  className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
/>
          

        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent opacity-0 transition group-hover:opacity-100" />

        <div className="absolute bottom-3 left-3 flex gap-2 opacity-0 transition group-hover:opacity-100">

          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white">
            <Play className="h-4 w-4 fill-white" />
          </span>

          <button
            onClick={(e)=>{
              e.preventDefault();
              toggle();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white"
          >
            {isFavorite 
              ? <Check className="h-4 w-4"/>
              : <Plus className="h-4 w-4"/>
            }
          </button>

        </div>

        <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
          {title.quality || 'HD'}
        </div>

      </div>

      <div className="mt-2">
        <h3 className="truncate text-sm font-semibold text-white">
          {title.title}
        </h3>

        <p className="text-xs text-ink-400">
          {title.type === 'tv' ? 'Série' : 'Filme'}
        </p>
      </div>

    </Link>
  );
}

export function PosterCardSkeleton(){
  return (
    <div className="w-[150px] sm:w-[180px]">
      <div className="skeleton aspect-[2/3] rounded-xl"/>
    </div>
  );
}






































