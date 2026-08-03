import { Link } from 'react-router-dom';
import { Play, Info, Star } from 'lucide-react';
import { img, titleName, titleMediaType } from '@/lib/tmdb';
import type { TmdbTitle } from '@/types';

export function Hero({ title }: { title: TmdbTitle }) {
  const backdrop = img(title.backdrop_url ?? title.backdrop_path, 'original') || img(title.poster_url ?? title.poster_path, 'original');
  const type = titleMediaType(title);

  return (
    <section className="relative h-[68vh] min-h-[460px] w-full overflow-hidden sm:h-[78vh]">
      {backdrop && (
        <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/30 to-transparent" />

      <div className="container-app relative flex h-full flex-col justify-end pb-12 sm:pb-16">
        <div className="max-w-2xl animate-fade-in">
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
          <h1 className="font-display text-4xl leading-none tracking-wide text-white sm:text-6xl lg:text-7xl">
            {titleName(title)}
          </h1>
          {title.description ?? title.overview && (
            <p className="mt-4 line-clamp-3 max-w-xl text-sm text-ink-200 sm:text-base">{title.description ?? title.overview}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to={`/assistir/${title.id}`} className="btn-primary">
              <Play className="h-4 w-4 fill-white" /> Assistir
            </Link>
            <Link to={`/assistir/${title.id}`} className="btn-ghost">
              <Info className="h-4 w-4" /> Mais informaes
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}






