import { Carousel } from "@/components/Carousel";
import { PosterCard, PosterCardSkeleton } from "@/components/cards/PosterCard";
import { useMovies } from "@/hooks/useMovies";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { Link } from "react-router-dom";
import { Crown, Sparkles } from "lucide-react";

export function HomePage() {

  const { user, subscription } = useAuth();
  const movies = useMovies("movie");
  const history = useWatchHistory();

  return (

    <div>
      <div className="container-app pt-8 space-y-10 pb-16">

        {!hasActiveSubscription(subscription) && (
          <UpgradeBanner />
        )}


        {user && history.data && history.data.length > 0 && (

          <Carousel title="Continuar assistindo">

            {history.data.slice(0,10).map((h)=>(
              <PosterCard
                key={h.id}
                title={{
                  id:h.tmdb_id,
                  title:h.title,
                  poster_url:h.poster_url,
                  poster_path:h.poster_path,
                  quality:"HD",
                  type:h.media_type
                }}
              />
            ))}

          </Carousel>

        )}


        <Carousel title="Filmes MovieFlix">

          {movies.isLoading ? (

            <>
              <PosterCardSkeleton/>
              <PosterCardSkeleton/>
              <PosterCardSkeleton/>
              <PosterCardSkeleton/>
              <PosterCardSkeleton/>
            </>

          ) : (

            movies.data?.map((movie)=>(
              <PosterCard
                key={movie.id}
                title={{
                  id:movie.id,
                  title:movie.title,
                  description:movie.description,
                  poster_url:movie.poster_url,
                  backdrop_path:movie.backdrop_url,
                  quality:movie.quality ?? "HD",
                  type:movie.type ?? "movie"
                }}
              />
            ))

          )}

        </Carousel>


      </div>
    </div>

  );

}


function UpgradeBanner(){

return(

<Link
to="/minha-assinatura"
className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-brand-600/30 bg-gradient-to-r from-brand-900/40 via-ink-900 to-ink-900 p-5"
>

<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
<Crown className="h-6 w-6"/>
</div>


<div className="flex-1">

<p className="flex items-center gap-2 font-semibold text-white">
<Sparkles className="h-4 w-4 text-brand-400"/>
Desbloqueie todo o conteúdo
</p>


<p className="text-sm text-ink-300">
Assine e assista sem limites.
</p>


</div>

</Link>

)

}
