import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
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

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function detectPlayerType(url: string): { type: "native" | "iframe" | "unknown"; src: string } {
  const u = url.trim();

  // YouTube
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { type: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&playsinline=1` };

  // YouTube shorts
  const yts = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (yts) return { type: "iframe", src: `https://www.youtube.com/embed/${yts[1]}?autoplay=1&rel=0&playsinline=1` };

  // Vimeo
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return { type: "iframe", src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&playsinline=1` };

  // Dailymotion
  const dm = u.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  if (dm) return { type: "iframe", src: `https://www.dailymotion.com/embed/video/${dm[1]}?autoplay=1&playsinline=1` };

  // Google Drive - converte para preview
  const gd = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return { type: "iframe", src: `https://drive.google.com/file/d/${gd[1]}/preview` };

  // Google Drive open?id=
  const gd2 = u.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (gd2) return { type: "iframe", src: `https://drive.google.com/file/d/${gd2[1]}/preview` };

  // Direct video files
  const lower = u.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg') || lower.endsWith('.mkv') || lower.includes('.mp4?') || lower.includes('.webm?')) {
    return { type: "native", src: u };
  }

  // M3U8 streams
  if (lower.endsWith('.m3u8') || lower.includes('.m3u8?')) {
    return { type: "native", src: u };
  }

  // If it's already an embed iframe
  if (u.includes('/embed/') || u.includes('/preview')) {
    return { type: "iframe", src: u };
  }

  return { type: "unknown", src: u };
}

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, subscription, loading, activeViewerProfile } = useAuth();
  const { entitlements } = useEntitlements();
  const subscriptionActive = hasActiveSubscription(subscription);
  const { blocked, activeScreens } = usePlaybackSession(user?.id, entitlements.screens, subscriptionActive);

  const [movie, setMovie] = useState<Movie | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [playerType, setPlayerType] = useState<"native" | "iframe" | "unknown">("unknown");
  const [embedSrc, setEmbedSrc] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);
  const [nativeError, setNativeError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsertHistory = useUpsertHistory();

  // Carrega filme
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) { setLoadingVideo(false); return; }
      setLoadingVideo(true);
      const { data } = await supabase.from("movies").select("*").eq("id", id).single();
      if (cancelled) return;
      if (data) {
        setMovie(data);
        if (data.video_url) {
          const detected = detectPlayerType(data.video_url);
          setVideoUrl(data.video_url);
          setPlayerType(detected.type);
          setEmbedSrc(detected.src);
        }
        let saved = 0, histDur = 0;
        if (user) {
          const row = await fetchHistoryForMovie(user.id, activeViewerProfile?.id ?? null, data.id);
          if (row) { saved = row.position_seconds ?? 0; histDur = row.duration_seconds ?? 0; }
        }
        if (saved >= 10 && (histDur <= 0 || saved / histDur < 0.95)) {
          setResumePos(saved);
          setShowResume(true);
        }
      }
      setLoadingVideo(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, user?.id, activeViewerProfile?.id]);

  // Setup video nativo
  useEffect(() => {
    if (playerType !== "native" || !videoUrl) return;
    const video = videoRef.current;
    if (!video) return;

    setNativeError(false);
    video.pause();
    video.removeAttribute("src");
    video.load();

    video.src = videoUrl;
    video.currentTime = showResume ? 0 : resumePos;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "true");
    video.preload = "auto";
    if (movie?.poster_url) video.poster = movie.poster_url;

    // Se não carregar em 12s, assume erro
    errorTimerRef.current = setTimeout(() => {
      if (video.readyState < 2) {
        setNativeError(true);
      }
    }, 12000);

    const onLoaded = () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      durRef.current = video.duration;
      video.play().catch(() => {});
    };
    const onTime = () => {
      posRef.current = video.currentTime;
      if (Math.abs(video.currentTime - lastSavedRef.current) >= 10) saveHistory(video.currentTime);
    };
    const onPauseEv = () => saveHistory(posRef.current);
    const onEnd = () => saveHistory(durRef.current);
    const onErr = () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      setNativeError(true);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", onPauseEv);
    video.addEventListener("ended", onEnd);
    video.addEventListener("error", onErr);

    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", onPauseEv);
      video.removeEventListener("ended", onEnd);
      video.removeEventListener("error", onErr);
    };
  }, [playerType, videoUrl, showResume, resumePos, movie?.poster_url]);

  const saveHistory = useCallback((t: number) => {
    if (!movie || !user || t <= 0) return;
    if (durRef.current > 0 && t >= durRef.current - 2) return;
    lastSavedRef.current = t;
    const type = String(movie.type ?? "").toLowerCase();
    const mediaType: MediaType = ["series", "serie", "tv", "anime"].includes(type) ? "tv" : "movie";
    upsertHistory.mutate({ movieId: movie.id, mediaType, title: movie.title, posterPath: movie.poster_url, backdropPath: movie.backdrop_url, positionSeconds: durRef.current > 0 ? Math.min(t, durRef.current) : t, durationSeconds: durRef.current || 0 });
  }, [movie, user, upsertHistory]);

  useEffect(() => () => { if (posRef.current > 0) saveHistory(posRef.current); }, [saveHistory]);

  // Controles nativos
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => { if (isPlaying) setShowControls(false); }, 3000);
  }, [isPlaying]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
    resetControls();
  };

  const skip = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + sec));
    resetControls();
  };

  const seek = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = val;
    setCurrentTime(val);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    resetControls();
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (loading) return <div className="flex h-screen w-screen items-center justify-center bg-black text-white">Carregando...</div>;
  if (!user) { navigate("/login"); return null; }
  if (!hasActiveSubscription(subscription)) {
    return <div className="flex h-screen w-screen items-center justify-center bg-black px-4 text-white text-center"><div><h1 className="text-2xl font-bold">Conteúdo exclusivo 🔒</h1><p className="mt-2 text-zinc-400">Você precisa de uma assinatura ativa.</p><button onClick={() => navigate("/minha-assinatura")} className="mt-5 rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-700">Ver planos</button></div></div>;
  }
  if (blocked) {
    return <div className="flex h-screen w-screen items-center justify-center bg-black px-4 text-white text-center"><div className="max-w-md"><h1 className="text-2xl font-bold">Limite de telas atingido</h1><p className="mt-2 text-zinc-400">Seu plano permite {entitlements.screens} {entitlements.screens === 1 ? "tela" : "telas"} e há {activeScreens} em uso.</p><button onClick={() => navigate("/minha-assinatura")} className="mt-5 rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-700">Fazer upgrade</button></div></div>;
  }

  return (
    <div className="fixed inset-0 z-0 h-screen w-screen overflow-hidden bg-black">
      {/* Voltar */}
      <button onClick={() => navigate(-1)} className="absolute left-3 top-3 z-50 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-black/80">
        <ArrowLeft size={16} />Voltar
      </button>

      {loadingVideo ? (
        <div className="flex h-full w-full items-center justify-center text-white">
          <div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" /><p className="mt-3 text-sm text-zinc-400">Carregando vídeo...</p></div>
        </div>
      ) : !videoUrl ? (
        <div className="flex h-full w-full items-center justify-center text-center text-white">
          <div><h2 className="text-xl font-semibold">Vídeo não encontrado</h2><p className="mt-2 text-sm text-zinc-400">Este filme ainda não possui uma URL de vídeo.</p></div>
        </div>
      ) : playerType === "iframe" || nativeError ? (
        /* IFRAME PLAYER - Google Drive, YouTube, etc */
        <iframe
          src={embedSrc || videoUrl}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          title={movie?.title || "Player"}
        />
      ) : playerType === "native" ? (
        /* NATIVE VIDEO PLAYER */
        <div className="relative h-full w-full" onClick={togglePlay} onMouseMove={resetControls} onTouchStart={resetControls}>
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            playsInline
            muted={isMuted}
            preload="auto"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />

          {!isPlaying && (
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 text-white shadow-2xl active:scale-95 transition">
              <svg className="h-7 w-7 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}

          <div className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-4 pt-16 transition-opacity duration-300 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={(e) => e.stopPropagation()}>
            <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(currentTime, duration || 0)} onChange={(e) => seek(Number(e.target.value))} className="mb-2 h-1.5 w-full cursor-pointer appearance-none rounded-full" style={{ background: `linear-gradient(to right, #dc2626 0%, #dc2626 ${progressPct}%, rgba(255,255,255,0.25) ${progressPct}%, rgba(255,255,255,0.25) 100%)` }} />
            <div className="flex items-center gap-3 text-white">
              <button onClick={togglePlay} className="text-xl">{isPlaying ? <svg className="h-6 w-6 fill-white" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg> : <svg className="h-6 w-6 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}</button>
              <button onClick={() => skip(-10)} className="text-xs font-medium">⏪ 10</button>
              <button onClick={() => skip(10)} className="text-xs font-medium">10 ⏩</button>
              <button onClick={toggleMute} className="text-lg">{isMuted ? "🔇" : "🔊"}</button>
              <span className="ml-auto text-xs text-white/70">{fmt(currentTime)} / {fmt(duration)}</span>
            </div>
          </div>

          {isMuted && isPlaying && (
            <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="absolute right-3 top-3 z-20 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
              🔇 Toque para ativar o som
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-white">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-lg font-semibold">Formato de vídeo não reconhecido</p>
          <p className="mt-2 text-sm text-zinc-400">A URL do vídeo não é suportada.</p>
        </div>
      )}

      {/* Resume overlay */}
      {showResume && playerType === "native" && !nativeError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600"><svg className="h-7 w-7 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
          <h2 className="text-lg font-bold text-white">Continuar assistindo?</h2>
          <p className="text-sm text-zinc-300">Você parou em {fmt(resumePos)}</p>
          <div className="flex gap-3">
            <button onClick={() => setShowResume(false)} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500">▶ Retomar</button>
            <button onClick={() => { setResumePos(0); setShowResume(false); }} className="rounded-lg border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Do início</button>
          </div>
        </div>
      )}
    </div>
  );
}
