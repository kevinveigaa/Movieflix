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
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* Detecta tipo de player */
function detectPlayer(url: string): { mode: "bunny" | "native" | "hls" | "iframe" | "unknown"; src: string } {
  const u = url.trim();
  const lower = u.toLowerCase();

  // Bunny M3U8 → embed oficial
  const m = u.match(/vz-([a-z0-9]+)\.b-cdn\.net\/([a-z0-9-]+)\/playlist\.m3u8/i);
  if (m) return { mode: "bunny", src: `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}?autoplay=true&preload=true&chromecast=true` };

  // Bunny embed já pronto
  const m2 = u.match(/iframe\.mediadelivery\.net\/embed\/(\d+)\/([a-z0-9-]+)/i);
  if (m2) return { mode: "bunny", src: `https://iframe.mediadelivery.net/embed/${m2[1]}/${m2[2]}?autoplay=true&preload=true&chromecast=true` };

  // MP4/WebM direto
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(u)) return { mode: "native", src: u };

  // HLS genérico
  if (/\.m3u8(\?|$)/i.test(u)) return { mode: "hls", src: u };

  // YouTube
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { mode: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&playsinline=1` };

  // Vimeo
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return { mode: "iframe", src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&playsinline=1` };

  // Google Drive
  const gd = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return { mode: "iframe", src: `https://drive.google.com/file/d/${gd[1]}/preview` };

  // Embed genérico
  if (u.includes("/embed/") || u.includes("/preview")) return { mode: "iframe", src: u };

  return { mode: "unknown", src: u };
}

/* Carrega hls.js do CDN */
function loadHlsJs(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).Hls) { resolve((window as any).Hls); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js";
    s.onload = () => resolve((window as any).Hls);
    s.onerror = () => reject(new Error("hls.js"));
    document.head.appendChild(s);
  });
}

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, subscription, loading, activeViewerProfile } = useAuth();
  const { entitlements } = useEntitlements();
  const subscriptionActive = hasActiveSubscription(subscription);
  const { blocked, activeScreens } = usePlaybackSession(user?.id, entitlements.screens, subscriptionActive);

  const [movie, setMovie] = useState<Movie | null>(null);
  const [playerInfo, setPlayerInfo] = useState({ mode: "unknown", src: "" });
  const [pageLoading, setPageLoading] = useState(true);
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hlsReady, setHlsReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsertHistory = useUpsertHistory();

  // ─── Carrega filme ───
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) { setPageLoading(false); return; }
      const { data } = await supabase.from("movies").select("*").eq("id", id).single();
      if (cancelled) return;
      if (data) {
        setMovie(data);
        if (data.video_url) setPlayerInfo(detectPlayer(data.video_url));
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
      setPageLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, user?.id, activeViewerProfile?.id]);

  // ─── Setup HLS ───
  useEffect(() => {
    if (playerInfo.mode !== "hls" || !videoRef.current) return;
    let cancelled = false;
    const start = showResume ? 0 : resumePos;

    async function init() {
      try {
        const Hls = await loadHlsJs();
        if (cancelled) return;
        const video = videoRef.current!;

        if (Hls.isSupported()) {
          const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
          hlsRef.current = hls;
          hls.loadSource(playerInfo.src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            setHlsReady(true);
            video.currentTime = start;
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal && !cancelled) setErrorMsg("Erro no stream HLS.");
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = playerInfo.src;
          video.currentTime = start;
          video.play().catch(() => {});
          setHlsReady(true);
        } else {
          setErrorMsg("Seu navegador não suporta HLS.");
        }
      } catch {
        if (!cancelled) setErrorMsg("Não foi possível carregar o player HLS.");
      }
    }

    // Timeout de segurança: se não carregar em 15s, mostra erro
    timeoutRef.current = setTimeout(() => {
      if (!hlsReady && !errorMsg) setErrorMsg("O vídeo está demorando para carregar. Tente recarregar.");
    }, 15000);

    init();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [playerInfo.mode, playerInfo.src, showResume, resumePos]);

  // ─── Setup Native ───
  useEffect(() => {
    if (playerInfo.mode !== "native" || !videoRef.current) return;
    const video = videoRef.current;
    const start = showResume ? 0 : resumePos;

    video.src = playerInfo.src;
    video.currentTime = start;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "true");
    video.preload = "auto";
    if (movie?.poster_url) video.poster = movie.poster_url;

    const onLoaded = () => video.play().catch(() => {});
    const onErr = () => setErrorMsg("Não foi possível carregar o vídeo.");

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onErr);

    timeoutRef.current = setTimeout(() => {
      if (video.readyState < 2) setErrorMsg("O vídeo está demorando para carregar.");
    }, 15000);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [playerInfo.mode, playerInfo.src, showResume, resumePos, movie?.poster_url]);

  // ─── Histórico ───
  const saveHistory = useCallback((t: number) => {
    if (!movie || !user || t <= 0) return;
    if (durRef.current > 0 && t >= durRef.current - 2) return;
    lastSavedRef.current = t;
    const type = String(movie.type ?? "").toLowerCase();
    const mediaType: MediaType = ["series", "serie", "tv", "anime"].includes(type) ? "tv" : "movie";
    upsertHistory.mutate({ movieId: movie.id, mediaType, title: movie.title, posterPath: movie.poster_url, backdropPath: movie.backdrop_url, positionSeconds: durRef.current > 0 ? Math.min(t, durRef.current) : t, durationSeconds: durRef.current || 0 });
  }, [movie, user, upsertHistory]);

  useEffect(() => () => { if (posRef.current > 0) saveHistory(posRef.current); }, [saveHistory]);

  // ─── Controles nativos ───
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

  // ─── Render ───
  if (loading) return <div className="flex h-screen w-screen items-center justify-center bg-black text-white">Carregando...</div>;
  if (!user) { navigate("/login"); return null; }
  if (!hasActiveSubscription(subscription)) {
    return <div className="flex h-screen w-screen items-center justify-center bg-black px-4 text-white text-center"><div><h1 className="text-2xl font-bold">Conteúdo exclusivo 🔒</h1><p className="mt-2 text-zinc-400">Você precisa de uma assinatura ativa.</p><button onClick={() => navigate("/minha-assinatura")} className="mt-5 rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-700">Ver planos</button></div></div>;
  }
  if (blocked) {
    return <div className="flex h-screen w-screen items-center justify-center bg-black px-4 text-white text-center"><div className="max-w-md"><h1 className="text-2xl font-bold">Limite de telas atingido</h1><p className="mt-2 text-zinc-400">Seu plano permite {entitlements.screens} {entitlements.screens === 1 ? "tela" : "telas"} e há {activeScreens} em uso.</p><button onClick={() => navigate("/minha-assinatura")} className="mt-5 rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-700">Fazer upgrade</button></div></div>;
  }

  const showNative = playerInfo.mode === "native" || playerInfo.mode === "hls";

  return (
    <div className="fixed inset-0 z-0 h-screen w-screen overflow-hidden bg-black">
      {/* Voltar */}
      <button onClick={() => navigate(-1)} className="absolute left-3 top-3 z-50 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-black/80 transition">
        <ArrowLeft size={16} />Voltar
      </button>

      {pageLoading ? (
        <div className="flex h-full w-full items-center justify-center text-white">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
            <p className="mt-3 text-sm text-zinc-400">Carregando vídeo...</p>
          </div>
        </div>
      ) : !playerInfo.src ? (
        <div className="flex h-full w-full items-center justify-center text-center text-white">
          <div><h2 className="text-xl font-semibold">Vídeo não encontrado</h2><p className="mt-2 text-sm text-zinc-400">Este filme ainda não possui uma URL de vídeo.</p></div>
        </div>
      ) : playerInfo.mode === "bunny" || playerInfo.mode === "iframe" ? (
        /* IFRAME — Bunny oficial, YouTube, Vimeo, Drive */
        <iframe
          src={playerInfo.src}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          title={movie?.title || "Player"}
        />
      ) : showNative ? (
        /* PLAYER NATIVO — MP4 ou HLS */
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
            onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); durRef.current = e.currentTarget.duration; }}
            onEnded={() => saveHistory(durRef.current)}
          />

          {/* Loading HLS */}
          {playerInfo.mode === "hls" && !hlsReady && !errorMsg && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
              <p className="mt-3 text-sm text-zinc-300">Carregando stream...</p>
            </div>
          )}

          {/* Erro */}
          {errorMsg && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 px-6 text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-lg font-semibold text-white">{errorMsg}</p>
              <button onClick={(e) => { e.stopPropagation(); window.location.reload(); }} className="mt-4 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
                🔄 Recarregar
              </button>
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

      {/* Resume */}
      {showResume && showNative && !errorMsg && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center backdrop-blur-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg">
            <svg className="h-7 w-7 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <h2 className="text-lg font-bold text-white">Continuar assistindo?</h2>
          <p className="text-sm text-zinc-300">Você parou em <span className="font-semibold text-white">{fmt(resumePos)}</span></p>
          <div className="flex gap-3">
            <button onClick={() => setShowResume(false)} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500">▶ Retomar</button>
            <button onClick={() => { setResumePos(0); setShowResume(false); }} className="rounded-lg border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Do início</button>
          </div>
        </div>
      )}
    </div>
  );
}
