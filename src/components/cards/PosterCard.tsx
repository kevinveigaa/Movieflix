import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Check, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useFavorite } from '@/hooks/useFavorite';
import type { MediaType } from '@/types';

interface MovieCardProps {
  title: any;
  className?: string;
  forceType?: 'movie' | 'tv';
  mediaType?: MediaType;
  progress?: number;
  showActions?: boolean;
}

export function PosterCard({
  title, className, forceType, mediaType = 'movie', progress, showActions = true,
}: MovieCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const { user } = useAuth();

  const tmdbId = typeof title.id === 'number' ? title.id : undefined;
  const favHook = tmdbId ? useFavorite(tmdbId, forceType || mediaType) : null;
  const isFav = favHook?.isFavorite ?? false;
  const toggleFav = favHook?.toggle;

  const type = forceType || mediaType || (title.media_type as MediaType) || 'movie';
  const linkTo = `/titulo/${type}/${title.id}`;
  const year = title?.year || title?.release_date?.slice(0, 4) || title?.first_air_date?.slice(0, 4) || '';
  const rating = title?.vote_average || title?.vote_average === 0 ? Number(title.vote_average).toFixed(1) : null;
  const quality = title?.quality || 'HD';

  return (
    <div className={cn('group relative flex w-full flex-col', className)}>
      <Link to={linkTo} aria-label={title?.title || title?.name || 'Ver detalhes'}
        className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-ink-800">
        <img src={imgError ? '/placeholder-poster.svg' : (title?.poster_url || title?.poster_path || '')}
          alt={title?.title || title?.name || 'Poster'} loading="lazy"
          onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)}
          className={cn('h-full w-full object-cover transition duration-500', imgLoaded ? 'opacity-100' : 'opacity-0', 'group-hover:scale-105')} />
        {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-60 transition-opacity group-hover:opacity-90" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">{quality}</span>
          {rating && Number(rating) > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-black">
              <Star className="h-2.5 w-2.5 fill-black" />{rating}
            </span>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-900/50 transition-transform hover:scale-110">
            <Play className="h-5 w-5 fill-white" />
          </span>
        </div>
        {typeof progress === 'number' && progress > 0 && progress < 100 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        )}
        {showActions && user && toggleFav && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="text-[10px] font-medium text-white/80">{year}</span>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(); }}
              className={cn('flex h-7 w-7 items-center justify-center rounded-full transition',
                isFav ? 'bg-brand-600 text-white' : 'bg-black/50 text-white hover:bg-brand-600')}
              aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
              {isFav ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </Link>
      <div className="pt-2.5">
        <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-white transition group-hover:text-brand-300 sm:text-sm">
          {title?.title || title?.name || 'Sem título'}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-400">
          {year && <span>{year}</span>}
          {title?.category && <><span className="h-1 w-1 rounded-full bg-ink-600" /><span className="truncate max-w-[80px]">{String(title.category).split(',')[0]}</span></>}
        </div>
      </div>
    </div>
  );
}

export function PosterCardSkeleton() {
  return (
    <div className="flex w-full flex-col">
      <div className="aspect-[2/3] w-full overflow-hidden rounded-xl bg-ink-800 skeleton" />
      <div className="space-y-2 pt-2.5">
        <div className="h-3.5 w-3/4 rounded bg-ink-800 skeleton" />
        <div className="h-3 w-1/2 rounded bg-ink-800 skeleton" />
      </div>
    </div>
  );
}
