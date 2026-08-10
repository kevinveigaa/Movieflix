import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { VideoPlayer } from "@/components/player/VideoPlayer";
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
  const [resumePos, setResumePos] = useState(0);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);
  const playerKeyRef = useRef(0);

  const upsertHistory = useUpsertHistory();

  // Carrega o filme UMA vez
  useEffect(() => {
    let cancelled = false;
    async function loadMovie() {
      if (!id) { setLoadingVideo(false); return; }
      setLoadingVideo(true);

      const { data } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .single();

      if (cancelled) return;

      if (data?.video_url) setVideoUrl(data.video_url);
      if (data) {
        setMovie(data);
        let saved = 0;
        let historyDuration = 0;
        if (user) {
          const row = await fetchHistoryForMovie(user.id, activeViewerProfile?.id ?? null, data.id);
          if (row) {
            saved = row.position_seconds ?? 0;
            historyDuration = row.duration_seconds ?? 0;
          }
        }
        const shouldResume = saved >= 10 && (historyDuration <= 0 || saved / historyDuration < 0.95);
        if (shouldResume) {
          setResumePos(saved);
          setShowResumePrompt(true);
        }
      }
      setLoadingVideo(false);
    }
    loadMovie();
    return () => { cancelled = true; };
  }, [id, user?.id, activeViewerProfile?.id]);

  // Salva histórico
  const saveHistory = useCallback((t: number) => {
    if (!movie || !user || t <= 0) return;
    if (durRef.current > 0 && t >= durRef.current - 2) return;
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
  }, [movie, user, upsertHistory]);

  const handleTimeUpdate = useCallback((t: number) => {
    posRef.current = t;
    if (Math.abs(t - lastSavedRef.current) >= 10) saveHistory(t);
  }, [saveHistory]);

  const handlePause = useCallback(() => saveHistory(posRef.current), [saveHistory]);
  const handleEnded = useCallback(() => saveHistory(durRef.current), [saveHistory]);
  const handleReady = useCallback((dur: number) => { durRef.current = dur; }, []);

  useEffect(() => {
    return () => { if (posRef.current > 0) saveHistory(posRef.current); };
  }, [saveHistory]);

  const handleResume = useCallback(() => {
    playerKeyRef.current += 1;
    setShowResumePrompt(false);
  }, []);

  const handleStartOver = useCallback(() => {
    setResumePos(0);
    playerKeyRef.current += 1;
    setShowResumePrompt(false);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        Carregando...
      </div>
    );
  }

  if (!user) { navigate("/login"); return null; }

  if (!hasActiveSubscription(subscription)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black px-4 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Conteúdo exclusivo 🔒</h1>
          <p className="mt-2 text-zinc-400">Você precisa de uma assinatura ativa para assistir.</p>
          <button onClick={() => navigate("/minha-assinatura")}
            className="mt-5 rounded-lg bg-red-600 px-5 py-3 font-semibold transition hover:bg-red-700">
            Ver planos
          </button>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black px-4 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Limite de telas atingido</h1>
          <p className="mt-2 text-zinc-400">
            Seu plano permite {entitlements.screens}{" "}
            {entitlements.screens === 1 ? "tela simultânea" : "telas simultâneas"} e no momento
            há {activeScreens} em uso.
          </p>
          <button onClick={() => navigate("/minha-assinatura")}
            className="mt-5 rounded-lg bg-red-600 px-5 py-3 font-semibold transition hover:bg-red-700">
            Fazer upgrade
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Botão voltar */}
      <button
        onClick={() => navigate(-1)}
        className="absolute left-3 top-3 z-50 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur transition hover:bg-black/80"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      {loadingVideo ? (
        <div className="flex h-full w-full items-center justify-center text-white">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
            <p className="mt-3 text-sm text-zinc-400">Carregando vídeo...</p>
          </div>
        </div>
      ) : videoUrl ? (
        <>
          <VideoPlayer
            key={playerKeyRef.current}
            src={videoUrl}
            startTime={showResumePrompt ? 0 : resumePos}
            poster={movie?.backdrop_url ?? movie?.poster_url ?? undefined}
            onTimeUpdate={handleTimeUpdate}
            onReady={handleReady}
            onPause={handlePause}
            onEnded={handleEnded}
          />

          {showResumePrompt && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600">
                <svg className="h-7 w-7 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
              <h2 className="text-lg font-bold text-white">Continuar assistindo?</h2>
              <p className="text-sm text-zinc-300">Você parou em {formatTime(resumePos)}</p>
              <div className="flex gap-3">
                <button onClick={handleResume}
                  className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500">
                  ▶ Retomar
                </button>
                <button onClick={handleStartOver}
                  className="rounded-lg border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
                  Do início
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-center text-white">
          <div>
            <h2 className="text-xl font-semibold">Vídeo não encontrado</h2>
            <p className="mt-2 text-sm text-zinc-400">Este filme ainda não possui uma URL de vídeo.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
