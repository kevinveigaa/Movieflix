import { Carousel } from '@/components/Carousel';
import { useMovies } from '@/hooks/useMovies';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { Link } from 'react-router-dom';
import { Crown, Sparkles } from 'lucide-react';

export function HomePage() {
  const { user } = useAuth();
  const movies = useMovies();
  const history = useWatchHistory();

  return (
    <div>
      <div className="container-app space-y-10 pb-16">

        {user && (history.data?.length ?? 0) > 0 && (
          <Carousel title="Continuar assistindo">
            {history.data?.filter((h) => h.title && h.poster_path).slice(0,10).map((h) => (
              <Link key={h.id} to={`/titulo/movie/${h.id}`} className="w-40">
                <img src={h.poster_path ?? ''} className="rounded-xl" />
                <p className="text-white text-sm mt-2">{h.title}</p>
              </Link>
            ))}
          </Carousel>
        )}

        {!hasActiveSubscription(useAuth().subscription) && (
          <UpgradeBanner />
        )}

      </div>
    </div>
  );
}


function UpgradeBanner() {
  return (
    <Link
      to="/minha-assinatura"
      className="flex items-center gap-4 rounded-2xl bg-black p-5"
    >
      <Crown className="text-white"/>
      <div>
        <p className="text-white font-bold">
          <Sparkles className="inline"/> Desbloqueie todo o conteúdo
        </p>
        <p className="text-gray-400">
          Assine e assista sem limites.
        </p>
      </div>
    </Link>
  );
}













