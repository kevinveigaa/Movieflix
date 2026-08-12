import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Play, ArrowLeft, Download, Lock, CheckCircle2, XCircle, Loader2, Clock, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useWatchHistory, useResetHistory } from "@/hooks/useWatchHistory";
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

interface Season {
  id: number;
  series_id: string;
  season_number: number;
  title: string | null;
  poster_url: string | null;
}

interface Episode {
  id: number;
  season_id: number;
  episode_number: number;
  title: string;
  description: string | null;
  video_url: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
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
  type?: string | null;
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
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({});
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [firstEpisode, setFirstEpisode] = useState<Episode | null>(null);
  const [lastWatchedEpisode, setLastWatchedEpisode] = useState<Episode | null>(null);

  const { user } = useAuth();
  const { entitlements } = useEntitlements();
  const history = useWatchHistory();
  const resetHistory = useResetHistory();

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
        // Se for série/anime SEM video_url, carrega temporadas e episódios
        if ((data.type === "series" || data.type === "tv" || data.type === "anime") && !data.video_url) {
          loadSeasonsAndEpisodes(data.id);
          if (user) loadLastWatchedEpisode(data.id);
        }
      } else {
        // Título inexistente no catálogo (ex.: id de outra fonte/TMDB).
        setNaoEncontrado(true);
      }
    }

    async function loadSeasonsAndEpisodes(seriesId: string) {
      setLoadingSeries(true);
      const { data: seasonsData } = await supabase
        .from("seasons")
        .select("*")
        .eq("series_id", seriesId)
        .order("season_number", { ascending: true });

      const seasonsList = seasonsData ?? [];
      setSeasons(seasonsList);

      if (seasonsList.length > 0) {
        setSelectedSeason(seasonsList[0].id);
        setExpandedSeason(seasonsList[0].id);
      }

      const eps: Record<string, Episode[]> = {};
      let firstEp: Episode | null = null;
      for (const season of seasonsList) {
        const { data: epData } = await supabase
          .from("episodes")
          .select("*")
          .eq("season_id", season.id)
          .order("episode_number", { ascending: true });
        const epList = epData ?? [];
        eps[season.id] = epList;
        if (!firstEp && epList.length > 0) {
          firstEp = epList[0];
        }
      }
      setEpisodes(eps);
      setFirstEpisode(firstEp);
      setLoadingSeries(false);
    }

    async function loadLastWatchedEpisode(seriesId: string) {
      if (!user) return;
      // Busca o histórico mais recente para esta série
      const { data: historyData } = await supabase
        .from("watch_history")
        .select("*")
        .eq("user_id", user.id)
        .eq("movie_id", seriesId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (historyData?.episode_id) {
        const { data: epData } = await supabase
          .from("episodes")
          .select("*")
          .eq("id", historyData.episode_id)
          .single();
        if (epData) setLastWatchedEpisode(epData);
      }
    }

    loadMovie();
  }, [id, user]);


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
            onClick={() => {
              const isSeries = movie?.type === "series" || movie?.type === "tv" || (movie?.type === "anime" && !movie?.video_url);
              if (isSeries) {
                // Para séries: se tem histórico de episódio, pergunta se continua
                if (lastWatchedEpisode && historyRow && historyRow.position_seconds > 30) {
                  setShowResumeModal(true);
                } else {
                  const targetEpisode = lastWatchedEpisode || firstEpisode;
                  if (targetEpisode) {
                    navigate('/assistir/' + movie.id + '?episode=' + targetEpisode.id);
                  } else {
                    setMsg?.({ tipo: "erro", texto: "Nenhum episódio disponível ainda." });
                  }
                }
              } else {
                // Para filmes: continua do histórico ou do início
                if (canResume && historyRow) {
                  setShowResumeModal(true);
                } else {
                  navigate('/assistir/' + movie.id);
                }
              }
            }}
            className="mt-5 flex w-fit items-center gap-2 rounded-lg bg-white px-5 py-3 font-bold text-black"
          >
            <Play fill="black" />
            {(() => {
              const isSeries = movie?.type === "series" || movie?.type === "tv" || (movie?.type === "anime" && !movie?.video_url);
              if (isSeries) {
                if (lastWatchedEpisode) return `Continuar Episódio ${lastWatchedEpisode.episode_number}`;
                if (firstEpisode) return `Assistir Episódio ${firstEpisode.episode_number}`;
                return "Assistir agora";
              }
              if (canResume && historyRow) return `Continuar de ${formatTime(historyRow.position_seconds)}`;
              return "Assistir agora";
            })()}
          </button>

          {/* Modal: Continuar de onde parou? */}
          {showResumeModal && historyRow && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
                <Clock className="mx-auto h-10 w-10 text-brand-400" />
                <h3 className="mt-3 text-lg font-bold text-white">Continuar assistindo?</h3>

                {isSeries && lastWatchedEpisode ? (
                  <>
                    <p className="mt-2 text-sm text-zinc-400">
                      Você parou no <span className="text-white font-semibold">Episódio {lastWatchedEpisode.episode_number}: {lastWatchedEpisode.title}</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {formatTime(historyRow.position_seconds)} de {formatTime(historyRow.duration_seconds || 0)}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-zinc-400">
                    Você parou em <span className="text-white font-semibold">{formatTime(historyRow.position_seconds)}</span> de {formatTime(historyRow.duration_seconds || 0)}.
                  </p>
                )}

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => {
                      setShowResumeModal(false);
                      if (isSeries && lastWatchedEpisode) {
                        // Do início = primeiro episódio
                        const targetEpisode = firstEpisode || lastWatchedEpisode;
                        navigate('/assistir/' + movie.id + '?episode=' + targetEpisode.id);
                      } else {
                        navigate('/assistir/' + movie.id);
                      }
                    }}
                    className="flex-1 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Do início
                  </button>
                  <button
                    onClick={() => {
                      setShowResumeModal(false);
                      if (isSeries && lastWatchedEpisode) {
                        navigate('/assistir/' + movie.id + '?episode=' + lastWatchedEpisode.id + '&t=' + historyRow.position_seconds);
                      } else {
                        navigate('/assistir/' + movie.id + '?t=' + historyRow.position_seconds);
                      }
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

      {/* Seção de Temporadas e Episódios - estilo Netflix */}
      {(movie?.type === "series" || movie?.type === "tv" || (movie?.type === "anime" && !movie?.video_url)) && (
        <div className="px-5 sm:px-8 md:px-10 py-8 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold mb-4">Episódios</h2>

          {loadingSeries ? (
            <p className="text-zinc-400">Carregando temporadas…</p>
          ) : seasons.length === 0 ? (
            <p className="text-zinc-400">Nenhuma temporada disponível ainda.</p>
          ) : (
            <div className="space-y-4">
              {/* Dropdown de Temporadas */}
              <div className="relative inline-block">
                <select
                  className="appearance-none bg-zinc-800 border border-zinc-700 text-white px-4 py-2 pr-10 rounded-lg cursor-pointer focus:outline-none focus:border-brand-500"
                  value={selectedSeason || ""}
                  onChange={(e) => {
                    const seasonId = e.target.value;
                    setSelectedSeason(seasonId);
                    setExpandedSeason(seasonId);
                  }}
                >
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      Temporada {season.season_number}{season.title ? ` - ${season.title}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-zinc-400" />
              </div>

              {/* Lista de Episódios da temporada selecionada */}
              {selectedSeason && (
                <div className="space-y-2">
                  {(episodes[selectedSeason] ?? []).length === 0 ? (
                    <p className="text-zinc-500 text-sm py-4">Nenhum episódio nesta temporada.</p>
                  ) : (
                    (episodes[selectedSeason] ?? []).map((ep) => (
                      <button
                        key={ep.id}
                        onClick={() => {
                          navigate(`/assistir/${movie?.id}?episode=${ep.id}`);
                        }}
                        className="w-full flex items-center gap-4 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition text-left group"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-800 group-hover:bg-brand-600 transition text-sm font-bold">
                          {ep.episode_number}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-white group-hover:text-brand-300 transition">{ep.title}</p>
                          {ep.description && (
                            <p className="text-xs text-zinc-500 line-clamp-1 mt-0.5">{ep.description}</p>
                          )}
                        </div>
                        <Play className="h-5 w-5 text-zinc-600 group-hover:text-white transition shrink-0" fill="currentColor" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}


