import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorite';
import { useAuth } from '@/context/AuthContext';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';

export function FavoritesPage() {
  const { user } = useAuth();
  const favs = useFavorites();

  if (!user) {
    return <EmptyState message="Faa login para ver seus favoritos." cta="Entrar" to="/login" />;
  }

  return (
    <div className="container-app py-8">
      <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">Favoritos</h1>
      <p className="mt-1 text-sm text-ink-400">Os títulos que voc salvou para assistir depois.</p>

      <div className="mt-8">
        {favs.isLoading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <PosterCardSkeleton key={i} />)}
          </div>
        ) : favs.data && favs.data.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {favs.data.map((f) => (
              <PosterCard
                key={f.id}
                title={{
                  id: f.tmdb_id,
                  title: f.media_type === 'movie' ? f.title : undefined,
                  name: f.media_type === 'tv' ? f.title : undefined,
                  poster_path: f.poster_path,
                  backdrop_path: f.backdrop_path,
                  vote_average: Number(f.vote_average ?? 0),
                  overview: '',
                  media_type: f.media_type,
                }}
                forceType={f.media_type}
                className="w-full"
              />
            ))}
          </div>
        ) : (
          <EmptyState message="Voc ainda no favoritou nenhum ttulo." cta="Explorar catlogo" to="/" />
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




