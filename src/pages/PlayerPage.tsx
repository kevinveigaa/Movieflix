import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { UniversalVideoPlayer, type UniversalVideoPlayerHandle } from "@/components/player/UniversalVideoPlayer";
import { useEntitlements } from "@/hooks/useEntitlements";
import { usePlaybackSession } from "@/hooks/usePlaybackSession";
import { useUpsertHistory, fetchHistoryForMovie } from "@/hooks/useWatchHistory";
import type { MediaType } from "@/types";

interface Movie {
  id: string;
  title: string;
  type?: string | null;
  poster_url?: string | null;
  backdrop_url?: string | null;
  video_url?: string | null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { user, subscription, loading, activeViewerProfile } = useAuth();
  const { entitlements } = useEntitlements();
  const subscriptionActive = hasActiveSubscription(subscription);
  const { blocked, activeScreens } = usePlaybackSession(
    user?.id,
    entitlements.screens,
    subscriptionActive,
  );

  const [movie, setMovie] = useState<Movie | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [resumePos, setResumePos] = useState<number | null>(null);
  const [choiceMade, setChoiceMade] = useState(false);

  const playerRef = useRef<UniversalVideoPlayerHandle>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);

  const upsertHistory = useUpsertHistory();

  useEffect(() => {
    async function loadMovie() {
      if (!id) {
        setLoadingVideo(false);
        return;
      }

      setLoadingVideo(true);

      const { data } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .single();

      if (data?.video_url) {
        setVideoUrl(data.video_url);
      }

      if (data) {
        setMovie(data);

        // Descobre onde o usuário parou (por perfil ativo + título do catálogo).
        let saved = 0;
        let historyDuration = 0;
        if (user) {
          const row = await fetchHistoryForMovie(user.id, activeViewerProfile?.id ?? null, data.id);
          if (row) {
            saved = row.position_seconds ?? 0;
            historyDuration = row.duration_seconds ?? 0;
          }
        }

        // Retoma se parou em ponto relevante e ainda não chegou ao fim.
        const shouldResume = saved >= 10 && (historyDuration <= 0 || saved / historyDuration < 0.95);
        if (shouldResume) {
          setResumePos(saved);
          setChoiceMade(false);
        } else {
          setResumePos(null);
          setChoiceMade(true);
        }
      }

      setLoadingVideo(false);
    }

    loadMovie();
  }, [id, user, activeViewerProfile?.id]);

  const saveHistory = useCallback(
    (t: number) => {
      if (!movie || !user || t <= 0) return;
      if (durRef.current > 0 && t >= durRef.current) return;

      lastSavedRef.current = t;
      const type = String(movie.type ?? "").toLowerCase();
      const mediaType: MediaType = ["series", "serie", "tv", "anime"].includes(type) ? "tv" : "movie";

      upsertHistory.mutate({
        movieId: movie.id,
        mediaType,
        title: movie.title,
        posterPath: movie.poster_url,
        backdropPath: movie.backdrop_url,
        positionSeconds: durRef.current > 0 ? Math.min(t, durRef.current) : t,
        durationSeconds: durRef.current || 0,
      });
    },
    [movie, user, upsertHistory],
  );

  const handleTimeUpdate = useCallback(
    (t: number) => {
      posRef.current = t;
      // Salva a cada ~10s (e também ao pausar/terminar).
      if (Math.abs(t - lastSavedRef.current) >= 10) saveHistory(t);
    },
    [saveHistory],
  );

  const handlePause = useCallback(() => saveHistory(posRef.current), [saveHistory]);
  const handleEnded = useCallback(() => saveHistory(durRef.current), [saveHistory]);
  const handleReady = useCallback((dur: number) => {
    durRef.current = dur;
  }, []);

  // Ao sair da página, grava a posição atual.
  useEffect(() => {
    return () => saveHistory(posRef.current);
  }, [saveHistory]);

  function resume() {
    playerRef.current?.seek(resumePos ?? 0);
    playerRef.current?.play();
    posRef.current = resumePos ?? 0;
    lastSavedRef.current = resumePos ?? 0;
    setChoiceMade(true);
  }

  function startFromBeginning() {
    playerRef.current?.seek(0);
    playerRef.current?.play();
    posRef.current = 0;
    lastSavedRef.current = 0;
    setChoiceMade(true);
  }

  // Vídeos do Google Drive rodam em iframe: não conseguimos controlar o tempo,
  // então não mostramos o "retomar" nem gravamos posição.
  const isDriveUrl = /(^|\/\/)drive\.google\.com\//i.test(videoUrl);

  const showResumeOverlay = resumePos !== null && !choiceMade && !isDriveUrl;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Carregando...
      </div>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  if (!hasActiveSubscription(subscription)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Conteúdo exclusivo 🔒
          </h1>

          <p className="mt-2 text-zinc-400">
            Você precisa de uma assinatura ativa para assistir.
          </p>

          <button
            onClick={() => navigate("/minha-assinatura")}
            className="mt-5 rounded-lg bg-purple-600 px-5 py-3 font-semibold transition hover:bg-purple-700"
          >
            Ver planos
          </button>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Limite de telas atingido</h1>

          <p className="mt-2 text-zinc-400">
            Seu plano permite {entitlements.screens}{" "}
            {entitlements.screens === 1 ? "tela simultânea" : "telas simultâneas"} e no momento
            há {activeScreens} em uso. Pause em outro dispositivo ou faça upgrade do plano.
          </p>

          <button
            onClick={() => navigate("/minha-assinatura")}
            className="mt-5 rounded-lg bg-purple-600 px-5 py-3 font-semibold transition hover:bg-purple-700"
          >
            Fazer upgrade
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-black">
      <button
        onClick={() => navigate(-1)}
        className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-white backdrop-blur transition hover:bg-black/90 sm:left-6 sm:top-6"
      >
        <ArrowLeft size={18} />
        Voltar
      </button>

      <div className="relative w-full">
        {loadingVideo ? (
          <div className="flex aspect-video w-full items-center justify-center text-white">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-purple-500" />

              <p className="mt-3 text-sm text-zinc-400">
                Carregando vídeo...
              </p>
            </div>
          </div>
        ) : videoUrl ? (
          <>
            <UniversalVideoPlayer
              ref={playerRef}
              src={videoUrl}
              autoPlay={!showResumeOverlay}
              controls
              maxHeight={entitlements.maxHeight}
              qualityLabel={entitlements.qualityLabel}
              onTimeUpdate={handleTimeUpdate}
              onReady={handleReady}
              onPause={handlePause}
              onEnded={handleEnded}
              className="mx-auto max-w-[1600px]"
            />

            {showResumeOverlay && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 text-center backdrop-blur-sm">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl">
                  <Play className="h-8 w-8 fill-white" />
                </span>

                <div>
                  <h2 className="text-xl font-bold text-white">Retomar de onde parou?</h2>
                  <p className="mt-1 text-sm text-zinc-300">
                    Você parou em <strong className="text-white">{formatTime(resumePos ?? 0)}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                  <button onClick={resume} className="btn-primary">
                    <Play className="h-4 w-4 fill-white" /> Retomar
                  </button>
                  <button onClick={startFromBeginning} className="btn-outline">
                    Começar do início
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex aspect-video items-center justify-center text-center text-white">
            <div>
              <h2 className="text-xl font-semibold">
                Vídeo não encontrado
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                Este filme ainda não possui uma URL de vídeo cadastrada.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
