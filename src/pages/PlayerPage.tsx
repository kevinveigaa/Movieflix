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

// Carrega hls.js do CDN dinamicamente
function loadHlsJs(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).Hls) { resolve((window as any).Hls); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js";
    script.onload = () => resolve((window as any).Hls);
    script.onerror = () => reject(new Error("Falha ao carregar hls.js"));
    document.head.appendChild(script);
  });
}

function detectPlayerType(url: string): { type: "hls" | "native" | "iframe" | "unknown"; src: string } {
  const u = url.trim().toLowerCase();
  if (u.endsWith(".m3u8") || u.includes(".m3u8?")) return { type: "hls", src: url.trim() };
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".ogg") || u.includes(".mp4?") || u.includes(".webm?")) return { type: "native", src: url.trim() };

  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { type: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&playsinline=1` };
  const yts = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (yts) return { type: "iframe", src: `https://www.youtube.com/embed/${yts[1]}?autoplay=1&rel=0&playsinline=1` };
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { type: "iframe", src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&playsinline=1` };
  const dm = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  if (dm) return { type: "iframe", src: `https://www.dailymotion.com/embed/video/${dm[1]}?autoplay=1&playsinline=1` };
  const gd = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return { type: "iframe", src: `https://drive.google.com/file/d/${gd[1]}/preview` };
  const gd2 = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (gd2) return { type: "iframe", src: `https://drive.google.com/file/d/${gd2[1]}/preview` };

  if (url.includes("/embed/") || url.includes("/preview") || url.includes("iframe")) return { type: "iframe", src: url.trim() };

  return { type: "unknown", src: url.trim() };
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
  const [playerType, setPlayerType] = useState<"hls" | "native" | "iframe" | "unknown">("unknown");
  const [embedSrc, setEmbedSrc] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hlsLoaded, setHlsLoaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);

  const upsertHistory = useUpsertHistory();

  // Carrega filme
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) { setLoadingVideo(false); return; }
      setLoadingVideo(true);
      setErrorMsg("");
      const { data } = await supabase.from("movies").select("*").eq("id", id).single();
      if (cancelled) return;
      if (data) {
        setMovie(data);
        if (data.video_url) {
          const detected = detectPlayerType(data.video_url);
          setVideoUrl(detected.src);
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

  // Setup HLS
  useEffect(() => {
    if (playerType !== "hls" || !videoUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const startTime = showResume ? 0 : resumePos;

    async function initHls() {
      try {
        const Hls = await loadHlsJs();
        if (cancelled) return;
        setHlsLoaded(true);

        if (Hls.isSupported()) {
          const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
          hlsRef.current = hls;
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            video.currentTime = startTime;
            video.muted = true;
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
              setErrorMsg("Erro ao carregar o stream HLS.");
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari nativo suporta HLS
          video.src = videoUrl;
          video.currentTime = startTime;
          video.muted = true;
          video.play().catch(() => {});
        } else {
          setErrorMsg("Seu navegador não suporta HLS.");
        }
      } catch (e) {
        if (!cancelled) setErrorMsg("Não foi possível carregar o player HLS.");
      }
    }

    initHls();

    return () => {
      cancelled = true;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [playerType, videoUrl, showResume, resumePos]);

  // Setup video nativo
  useEffect(() => {
    if (playerType !== "native" || !videoUrl) return;
    const video = videoRef.current;
    if (!video) return;

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

    const onLoaded = () => { durRef.current = video.duration; video.play().catch(() => {}); };
    const onErr = () => setErrorMsg("Não foi possível carregar o vídeo.");

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onErr);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
    };
  }, [playerType, videoUrl, showResume, resumePos, movie?.poster_url]);

  // Histórico
  const saveHistory = useCallback((t: number) => {
    if (!movie || !user || t <= 0) return;
    if (durRef.current > 0 && t >= durRef.current - 2) return;
    lastSavedRef.current = t;
    const type = String(movie.type ?? "").toLowerCase();
    const mediaType: MediaType = ["series", "serie", "tv", "anime"].includes(type) ? "tv" : "movie";
    upsertHistory.mutate({ movieId: movie.id, mediaType, title: movie.title, posterPath: movie.poster_url, backdropPath: movie.backdrop_url, positionSeconds: durRef.current > 0 ? Math.min(t, durRef.current) : t, durationSeconds: durRef.current || 0 });
  }, [movie, user, upsertHistory]);

  useEffect(() => () => { if (posRef.current > 0) saveHistory(posRef.current); }, [saveHistory]);

  // Controles nativos/HLS
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

  const showNativePlayer = playerType === "native" || playerType === "hls";

  return (
    <div className="fixed inset-0 z-0 h-screen w-screen overflow-hidden bg-black">
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
      ) : playerType === "iframe" ? (
        <iframe src={embedSrc} className="h-full w-full border-0" allow="autoplay; fullscreen; encrypted-media" allowFullScreen title={movie?.title || "Player"} />
      ) : showNativePlayer ? (
        <div className="relative h-full w-full" onClick={togglePlay} onMouseMove={resetControls} onTouchStart={resetControls}>
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            playsInline
            muted={isMuted}
            preload="auto"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) => { setCurrentTime(e.currentTarget.currentTime); posRef.current = e.currentTarget.currentTime; }}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => saveHistory(durRef.current)}
          />

          {/* Loading HLS */}
          {playerType === "hls" && !hlsLoaded && !errorMsg && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
              <p className="mt-3 text-sm text-zinc-300">Carregando stream HLS...</p>
            </div>
          )}

          {/* Erro */}
          {errorMsg && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 px-6 text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-lg font-semibold text-white">{errorMsg}</p>
              <p className="mt-2 text-sm text-zinc-400">Tente recarregar a página ou use outro navegador.</p>
              {embedSrc && embedSrc !== videoUrl && (
                <button onClick={(e) => { e.stopPropagation(); setPlayerType("iframe"); }} className="mt-4 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
                  Tentar player alternativo
                </button>
              )}
            </div>
          )}

          {/* Play central */}
          {!isPlaying && !errorMsg && (
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 text-white shadow-2xl active:scale-95 transition">
              <svg className="h-7 w-7 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
          )}

          {/* Controles */}
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

          {isMuted && isPlaying && !errorMsg && (
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
      {showResume && showNativePlayer && !errorMsg && (
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
