import { useParams, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Play, ArrowLeft, Clock, RotateCcw, Film, Layers } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { useMovies } from "@/hooks/useMovies";
import { useSeriesHidden } from "@/hooks/useSeriesHidden";
import { ehSerie } from "@/lib/media";
import { streamBetterMovieUrl } from "@/lib/strembetter";
import { primeiroEpisodio, temporadasDisponiveis, totalEpisodios, type EpisodioRef } from "@/lib/episodes";
import { EpisodioSelector } from "@/components/series/EpisodioSelector";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Movie {
  id: string;
  title: string;
  description?: string | null;
  year?: string | null;
  poster_url?: string | null;
  backdrop_url?: string | null;
  video_url?: string;
  vote_average?: number | null;
  category?: string | null;
  language?: string | null;
  quality?: string | null;
  type?: string | null;
  tmdb_id?: number | string;
  seasons?: number | null;
  episodes?: number | null;
  episodes_available?: string[];
}

export function TitleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { user } = useAuth();
  const history = useWatchHistory();
  const movies = useMovies();
  const { seriesHidden } = useSeriesHidden();

  const [showResumeModal, setShowResumeModal] = useState(false);

  // O título vem do catálogo do StreamBetter (cache da query de filmes).
  const movie: Movie | null = useMemo(() => {
    const lista = movies.data ?? [];
    return (
      lista.find((m) => String(m.id) === String(id)) ||
      lista.find((m) => String(m.tmdb_id) === String(id)) ||
      null
    );
  }, [movies.data, id]);

  const naoEncontrado = !movies.isLoading && !movie;

  // Registro de reprodução deste título (para o botão "Continuar de ...").
  const historyRow = useMemo(
    () => history.data?.find((h) => String(h.movie_id) === String(movie?.id) || String(h.tmdb_id) === String(movie?.tmdb_id)),
    [history.data, movie],
  );
  const watchPct = historyRow && historyRow.duration_seconds
    ? historyRow.position_seconds / historyRow.duration_seconds
    : 0;
  const canResume = Boolean(historyRow) && watchPct >= 0.02 && watchPct < 0.95;

  const indisponivel = naoEncontrado || (seriesHidden && movie !== null && ehSerie(movie));

  // Primeiro episódio disponível (para o botão "Assistir agora" de séries).
  const primeiroEp = movie?.episodes_available ? primeiroEpisodio(movie.episodes_available) : null;
  const isSeries = movie?.type === "series" || movie?.type === "tv" || (movie?.type === "anime" && !movie?.video_url);

  // URL de reprodução: séries → /assistir/{id}?season=S&ep=E; filmes → /assistir/{id}
  const watchUrl = isSeries
    ? primeiroEp
      ? `/assistir/${movie?.id}?season=${primeiroEp.season}&ep=${primeiroEp.episode}`
      : `/assistir/${movie?.id}`
    : `/assistir/${movie?.id}`;

  const assistirEpisodio = (ep: EpisodioRef) => {
    navigate(`/assistir/${movie?.id}?season=${ep.season}&ep=${ep.episode}`);
  };

  if (indisponivel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4 text-center text-white">
        <Film className="h-14 w-14 text-zinc-700" />
        <h1 className="text-3xl font-bold">Título não encontrado</h1>
        <p className="text-zinc-400">Este título não está disponível no catálogo.</p>
        <button
          onClick={() => navigate("/")}
          className="rounded-lg bg-white px-5 py-3 font-bold text-black"
        >
          Explorar catálogo
        </button>
      </div>
    );
  }

  if (!movie || movies.isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando filme...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">

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
            {movie.vote_average ? (
              <span>⭐ {movie.vote_average}</span>
            ) : null}
            {isSeries && (
              <span className="text-zinc-400">
                {movie.episodes_available?.length
                  ? `${totalEpisodios(movie.episodes_available)} episódios disponíveis`
                  : 'Série'}
              </span>
            )}
          </div>

          {(movie.category || movie.quality || movie.language) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(movie.category ?? "")
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean)
                .map((c) => (
                  <span key={c} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                    {c}
                  </span>
                ))}
              {movie.quality && (
                <span className="rounded-full border border-roxo-500/30 bg-roxo-500/10 px-3 py-1 text-xs text-roxo-300">
                  {movie.quality}
                </span>
              )}
              {movie.language && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  {movie.language}
                </span>
              )}
            </div>
          )}

          <p className="mt-4 text-sm sm:text-base md:text-lg text-zinc-300 line-clamp-4">
            {movie.description || "Sinopse não disponível."}
          </p>

          <button
            onClick={() => {
              if (canResume && historyRow) {
                setShowResumeModal(true);
              } else {
                navigate(watchUrl);
              }
            }}
            className="mt-5 flex w-fit items-center gap-2 rounded-lg bg-white px-5 py-3 font-bold text-black"
          >
            <Play fill="black" />
            {canResume && historyRow ? `Continuar de ${formatTime(historyRow.position_seconds)}` : "Assistir agora"}
          </button>

          <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Reproduzido pelo player StreamBetter · áudio pt-BR preferido
          </p>

          {/* Modal: Continuar de onde parou? */}
          {showResumeModal && historyRow && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
                <Clock className="mx-auto h-10 w-10 text-roxo-400" />
                <h3 className="mt-3 text-lg font-bold text-white">Continuar assistindo?</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Você parou em <span className="text-white font-semibold">{formatTime(historyRow.position_seconds)}</span> de {formatTime(historyRow.duration_seconds || 0)}.
                </p>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => {
                      setShowResumeModal(false);
                      navigate(`/assistir/${movie.id}`);
                    }}
                    className="flex-1 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Do início
                  </button>
                  <button
                    onClick={() => {
                      setShowResumeModal(false);
                      navigate(`/assistir/${movie.id}?t=${historyRow.position_seconds}`);
                    }}
                    className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-500 flex items-center justify-center gap-2"
                  >
                    <Play className="h-4 w-4" fill="white" />
                    Continuar
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Série: seletor de temporada e episódio abaixo do banner */}
      {isSeries && movie.episodes_available && movie.episodes_available.length > 0 && (
        <div className="container-app py-8">
          <div className="mb-4 flex items-center gap-2">
            <Layers className="h-5 w-5 text-roxo-400" />
            <h2 className="text-lg font-bold">Episódios</h2>
            <span className="ml-auto text-xs text-zinc-500">
              {temporadasDisponiveis(movie.episodes_available).length} temporada(s) ·{' '}
              {totalEpisodios(movie.episodes_available)} episódio(s)
            </span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <EpisodioSelector
              episodes={movie.episodes_available}
              current={primeiroEp}
              onSelect={assistirEpisodio}
            />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Escolha um episódio para começar a assistir — o player abre direto na temporada e episódio selecionados.
          </p>
        </div>
      )}

    </div>
  );
}
