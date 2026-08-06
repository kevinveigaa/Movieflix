import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Play, ArrowLeft } from "lucide-react";

interface Movie {
  id: string;
  title: string;
  description?: string;
  year?: string;
  poster_url?: string;
  backdrop_url?: string;
  vote_average?: number;
}

export function TitleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [movie, setMovie] = useState<Movie | null>(null);

  useEffect(() => {
    async function loadMovie() {
      if (!id) return;

      const { data, error } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .single();

      console.log("FILME:", data, error);

      if (data) {
        setMovie(data);
      }
    }

    loadMovie();
  }, [id]);


  if (!movie) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando filme...
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-black text-white pt-16 md:pt-20">

      <div
        className="relative min-h-[600px] md:h-[500px] bg-cover bg-center"
        style={{
          backgroundImage: `url(${movie.backdrop_url || movie.poster_url})`
        }}
      >

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />


        <button
          onClick={() => navigate(-1)}
          className="absolute top-5 left-5 rounded-full bg-black/60 p-3"
        >
          <ArrowLeft />
        </button>


        <div className="absolute bottom-0 left-0 w-full p-5 sm:p-8 md:left-10 md:bottom-10 md:w-auto md:max-w-2xl">

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            {movie.title}
          </h1>


          <div className="mt-3 flex gap-4 text-zinc-300">
            {movie.year && <span>{movie.year}</span>}

            {movie.vote_average && (
              <span>
                ⭐ {movie.vote_average}
              </span>
            )}
          </div>


          <p className="mt-4 text-sm sm:text-base md:text-lg text-zinc-300 line-clamp-4">
            {movie.description || "Sinopse não disponível."}
          </p>


          <button
            onClick={() => navigate(`/assistir/${movie.id}`)}
            className="mt-5 flex w-fit items-center gap-2 rounded-lg bg-white px-5 py-3 font-bold text-black"
          >
            <Play fill="black" />
            Assistir agora
          </button>

        </div>

      </div>

    </div>
  );
}


