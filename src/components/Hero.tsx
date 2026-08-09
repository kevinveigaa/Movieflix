import { Link } from 'react-router-dom';
import { Play, Info, Star } from 'lucide-react';
import { img, titleName, titleMediaType } from '@/lib/tmdb';
import type { TmdbTitle } from '@/types';

export function Hero({ title }: { title: TmdbTitle }) {
  const backdrop = img(title.backdrop_path, 'original') || img(title.poster_path, 'original');
  const type = titleMediaType(title);

  return (
    <section className="relative h-[60vh] min-h-[420px] w-full overflow-hidden sm:h-[72vh] lg:h-[82vh] xl:h-[85vh]">
      {backdrop && (
        <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/30 to-transparent" />

      <div className="container-app relative flex h-full flex-col justify-end pb-8 sm:pb-16 lg:pb-20">
        <div className="max-w-xl sm:max-w-2xl animate-fade-in">
          <div className="mb-3 flex items-center gap-3">
            <span className="chip border-brand-600/40 bg-brand-600/15 text-brand-300">
              <Star className="h-3.5 w-3.5 fill-brand-400 text-brand-400" />
              Em destaque
            </span>
            {title.vote_average > 0 && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-400">
                <Star className="h-4 w-4 fill-amber-400" /> {title.vote_average.toFixed(1)}
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl leading-tight tracking-wide text-white sm:text-5xl lg:text-7xl xl:text-8xl">
            {titleName(title)}
          </h1>
          {title.overview && (
            <p className="mt-3 line-clamp-3 max-w-xl text-xs text-ink-200 sm:text-base lg:text-lg">{title.overview}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to={`/assistir/${title.id}`} className="btn-primary">
              <Play className="h-4 w-4 fill-white" /> Assistir
            </Link>
            <Link to={`/assistir/${title.id}`} className="btn-ghost">
              <Info className="h-4 w-4" /> Mais informações
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}








