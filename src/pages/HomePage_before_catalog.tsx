import { useQuery } from '@tanstack/react-query';
import { tmdb } from '@/lib/tmdb';
import { Carousel } from '@/components/Carousel';
import { Hero } from '@/components/Hero';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { RowSkeleton } from '@/components/ui/Feedback';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useMovies } from '@/hooks/useMovies';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import { Crown, Sparkles } from 'lucide-react';
import type { TmdbTitle, TmdbPage } from '@/types';

export function HomePage() {
  const trending = useQuery({ queryKey: ['trending'], queryFn: () => tmdb.trending('week') });
  const popularMovies = useQuery({ queryKey: ['popularMovies'], queryFn: () => tmdb.popularMovies() });
  const popularTv = useQuery({ queryKey: ['popularTv'], queryFn: () => tmdb.popularTv() });
  const topRated = useQuery({ queryKey: ['topRatedMovies'], queryFn: () => tmdb.topRatedMovies() });
  const nowPlaying = useQuery({ queryKey: ['nowPlaying'], queryFn: () => tmdb.nowPlaying() });
  const anime = useQuery({ queryKey: ['animeHome'], queryFn: () => tmdb.anime() });
  const docs = useQuery({ queryKey: ['docsHome'], queryFn: () => tmdb.documentaries() });
  const { user } = useAuth();
  const history = useWatchHistory();
  const movies = useMovies();

  const hero = trending.data?.results?.find((t) => t.backdrop_path && t.overview) ?? trending.data?.results?.[0];

  const loading = trending.isLoading;
  const historyItems: TmdbTitle[] = (history.data ?? []).slice(0, 10).map((h) => ({
    id: h.tmdb_id,
    title: h.title,
    poster_path: h.poster_path,
    backdrop_path: h.backdrop_path,
    vote_average: Number(h.vote_average ?? 0),
    media_type: h.media_type as 'movie' | 'tv',
    overview: '',
  }));

  return (
    <div>
      {loading || !hero ? (
        <div className="skeleton h-[68vh] w-full sm:h-[78vh]" />
      ) : (
        <Hero title={hero} />
      )}

      <div className="container-app -mt-8 space-y-10 pb-16 sm:-mt-12">
        {user && historyItems.length > 0 && (
          <Carousel title="Continuar assistindo">
            {historyItems.map((t) => (
              <PosterCard key={`h-${t.id}`} title={t} />
            ))}
          </Carousel>
        )}

        {!hasActiveSubscription(useAuth().subscription) && (
          <UpgradeBanner />
        )}

        <Carousel title="Filmes Dublados">
          {movies.data?.map((movie) => (
            <div key={movie.id} className="w-40">
              <img src={movie.poster_url ?? ""} className="rounded-xl" />
              <p className="mt-2 text-sm text-white">{movie.title}</p>
            </div>
          ))}
        </Carousel>

        <CarouselSection title="Em alta esta semana" query={trending} />
        <CarouselSection title="Filmes populares" query={popularMovies} />
        <CarouselSection title="Séries populares" query={popularTv} />
        <CarouselSection title="Nos cinemas agora" query={nowPlaying} />
        <CarouselSection title="Animes populares" query={anime} />
        <CarouselSection title="Documentários" query={docs} />
        <CarouselSection title="Mais bem avaliados" query={topRated} />
      </div>
    </div>
  );
}

function CarouselSection({ title, query }: { title: string; query: ReturnType<typeof useQuery<TmdbPage<TmdbTitle>>> }) {
  return (
    <Carousel title={title}>
      {query.isLoading
        ? Array.from({ length: 8 }).map((_, i) => <PosterCardSkeleton key={i} />)
        : query.data?.results
            ?.filter((t) => t.media_type !== 'person')
            .map((t) => <PosterCard key={t.id} title={t as TmdbTitle} />) ?? <RowSkeleton />}
    </Carousel>
  );
}

function UpgradeBanner() {
  return (
    <Link
      to="/minha-assinatura"
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-brand-600/30 bg-gradient-to-r from-brand-900/40 via-ink-900 to-ink-900 p-5 transition hover:border-brand-500/50"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Crown className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="flex items-center gap-2 font-semibold text-white">
          <Sparkles className="h-4 w-4 text-brand-400" /> Desbloqueie todo o conteúdo
        </p>
        <p className="text-sm text-ink-300">Assine a partir de R$19,90/ms e assista sem limites.</p>
      </div>
      <span className="btn-primary hidden sm:inline-flex">Assinar agora</span>
    </Link>
  );
}




