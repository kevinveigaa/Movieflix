import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Play, ArrowLeft, Download, Lock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useWatchHistory } from "@/hooks/useWatchHistory";
import { hasUnlimitedDownloads } from "@/lib/plans";
import { downloadVideo } from "@/lib/hlsDownload";
import {
  alreadyDownloaded,
  downloadsUsed,
  registerDownload,
} from "@/lib/downloads";

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
  description?: string;
  year?: string;
  poster_url?: string;
  video_url?: string;
  backdrop_url?: string;
  vote_average?: number;
  category?: string | null;
  language?: string | null;
  quality?: string | null;
}

export function TitleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadCount, setDownloadCount] = useState(0);

  const { user } = useAuth();
  const { entitlements } = useEntitlements();
  const history = useWatchHistory();

  // Registro de reprodução deste título (para o botão "Continuar de ...").
  const historyRow = useMemo(
    () => history.data?.find((h) => h.movie_id === movie?.id),
    [history.data, movie],
  );
  const watchPct = historyRow && historyRow.duration_seconds
    ? historyRow.position_seconds / historyRow.duration_seconds
    : 0;
  const canResume = Boolean(historyRow) && watchPct >= 0.02 && watchPct < 0.95;

  useEffect(() => {
    if (user?.id) setDownloadCount(downloadsUsed(user.id));
  }, [user?.id]);

  async function handleDownload() {
    if (!user) {
      navigate("/login");
      return;
    }

    if (entitlements.downloads <= 0) {
      setDownloadMsg("Seu plano atual não inclui downloads. Faça upgrade para baixar filmes.");
      return;
    }

    if (!movie?.video_url) {
      setDownloadMsg("Este título ainda não tem arquivo disponível para download.");
      return;
    }

    const isRepeat = alreadyDownloaded(user.id, movie.id);
    const unlimited = hasUnlimitedDownloads(entitlements.downloads);

    if (!isRepeat && !unlimited && downloadCount >= entitlements.downloads) {
      setDownloadMsg(
        `Você já usou seus ${entitlements.downloads} downloads deste mês. Faça upgrade para baixar mais.`,
      );
      return;
    }

    setDownloading(true);
    setProgress(0);
    setDownloadMsg("");
    setDownloadError("");

    try {
      await downloadVideo({
        url: movie.video_url,
        title: movie.title,
        maxHeight: entitlements.maxHeight,
        onProgress: (percent) => setProgress(percent),
        onStarted: () => {
          registerDownload(user.id, movie.id);
          setDownloadCount(downloadsUsed(user.id));
          setDownloadMsg("Download iniciado. O arquivo ficará disponível offline no seu dispositivo.");
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Usuário cancelou o diálogo de salvar arquivo — não é um erro.
        setDownloadMsg("");
      } else {
        setDownloadError(
          (err as Error).message || "Não foi possível baixar o vídeo. Tente novamente.",
        );
      }
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    async function loadMovie() {
      if (!id) return;

      const { data } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (data) {
        setMovie(data);
      } else {
        // Título inexistente no catálogo (ex.: id de outra fonte/TMDB).
        setNaoEncontrado(true);
      }
    }

    loadMovie();
  }, [id]);


  if (naoEncontrado) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4 text-center text-white">
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
                <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-300">
                  {movie.quality}
                </span>
              )}
              {movie.language && (
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                  {movie.language}
                </span>
              )}
            </div>
          )}


          <p className="mt-4 text-sm sm:text-base md:text-lg text-zinc-300 line-clamp-4">
            {movie.description || "Sinopse não disponível."}
          </p>


          <button
            onClick={() => navigate(`/assistir/${movie.id}`)}
            className="mt-5 flex w-fit items-center gap-2 rounded-lg bg-white px-5 py-3 font-bold text-black"
          >
            <Play fill="black" />
            {canResume && historyRow
              ? `Continuar de ${formatTime(historyRow.position_seconds)}`
              : "Assistir agora"}
          </button>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className={`flex w-fit items-center gap-2 rounded-lg px-5 py-3 font-semibold transition ${
                entitlements.downloads > 0
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              } ${downloading ? "cursor-not-allowed opacity-70" : ""}`}
            >
              {downloading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Preparando download… {progress}%
                </>
              ) : entitlements.downloads > 0 ? (
                <>
                  <Download size={18} />
                  Baixar filme
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Baixar filme
                </>
              )}
            </button>

            <span className="text-xs text-zinc-400">
              {entitlements.downloads > 0
                ? hasUnlimitedDownloads(entitlements.downloads)
                  ? `${downloadCount} download${downloadCount === 1 ? "" : "s"} neste mês • Downloads ilimitados • Qualidade até ${entitlements.qualityLabel}`
                  : `${downloadCount}/${entitlements.downloads} downloads usados neste mês • Qualidade até ${entitlements.qualityLabel}`
                : "Downloads disponíveis nos planos Standard e Premium"}
            </span>
          </div>

          {downloadMsg && (
            <p className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <CheckCircle2 size={16} className="text-brand-400" />
              {downloadMsg}
            </p>
          )}

          {downloadError && (
            <p className="mt-3 flex items-center gap-2 text-sm text-red-400">
              <XCircle size={16} className="shrink-0 text-red-400" />
              {downloadError}
            </p>
          )}

        </div>

      </div>

    </div>
  );
}


