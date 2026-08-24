import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useCatalogFavorites } from '@/hooks/useFavorite';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useAuth } from '@/context/AuthContext';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { ehSerie } from '@/lib/media';

export function FavoritesPage() {
  const { user } = useAuth();
  const favs = useCatalogFavorites();
  const { seriesHidden } = useSeriesHidden();

  // Favoritos de séries (media_type 'tv') somem quando as séries estão ocultas.
  // Cada item já foi resolvido contra o catálogo real (só existem títulos reais).
  const items = seriesHidden
    ? (favs.items ?? []).filter(({ movie }) => !ehSerie(movie))
    : (favs.items ?? []);

  if (!user) {
    return <EmptyState message="Faça login para ver seus favoritos." cta="Entrar" to="/login" />;
  }

  return (
    <div className="container-app py-8">
      <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">Favoritos</h1>
      <p className="mt-1 text-sm text-ink-400">Os títulos que você salvou para assistir depois.</p>

      <div className="mt-8">
        {favs.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 6 }).map((_, i) => <PosterCardSkeleton key={i} />)}
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {items.map(({ favorite, movie }) => (
              <PosterCard
                key={favorite.id}
                title={{
                  id: movie.id,
                  title: movie.title,
                  name: ehSerie(movie) ? movie.title : undefined,
                  poster_path: movie.poster_url,
                  backdrop_path: movie.backdrop_url,
                  vote_average: Number(movie.vote_average ?? 0),
                  overview: movie.description ?? '',
                  media_type: ehSerie(movie) ? 'tv' : 'movie',
                }}
                forceType={ehSerie(movie) ? 'tv' : 'movie'}
                className="w-full"
              />
            ))}
          </div>
        ) : (
          <EmptyState message="Você ainda não favoritou nenhum título." cta="Explorar catálogo" to="/" />
        )}
      </div>
    </div>
  );
}

function EmptyState({ message, cta, to }: { message: string; cta: string; to: string }) {
  return (
    <div className="container-app flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <Heart className="h-12 w-12 text-ink-600" />
      <p className="text-ink-400">{message}</p>
      <Link to={to} className="btn-primary">{cta}</Link>
    </div>
  );
}