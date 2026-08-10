import { useEffect, useRef, useCallback, useState } from "react";

interface VideoPlayerProps {
  src: string;
  startTime?: number;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onPause?: () => void;
  onEnded?: () => void;
}

export function VideoPlayer({
  src,
  startTime = 0,
  poster,
  onTimeUpdate,
  onReady,
  onPause,
  onEnded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs para callbacks (evita re-criar listeners)
  const callbacksRef = useRef({ onTimeUpdate, onReady, onPause, onEnded });
  callbacksRef.current = { onTimeUpdate, onReady, onPause, onEnded };

  // Estados apenas para UI overlay (não afetam o video element)
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true); // Começa mutado para autoplay mobile
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ─── Setup do vídeo (roda apenas quando src muda) ───
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset
    video.pause();
    video.removeAttribute("src");
    video.load();

    // Configurações críticas para mobile
    video.src = src;
    video.currentTime = startTime;
    video.muted = true; // ESSENCIAL para autoplay no mobile
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("x5-playsinline", "true");
    video.setAttribute("x5-video-player-type", "h5");
    video.setAttribute("x5-video-player-fullscreen", "false");
    video.preload = "auto";

    // Tenta autoplay
    const tryPlay = () => {
      video.play().catch(() => {});
    };

    const onLoaded = () => {
      setDuration(video.duration);
      callbacksRef.current.onReady?.(video.duration);
      tryPlay();
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      callbacksRef.current.onPause?.();
    };

    const onTime = () => {
      setCurrentTime(video.currentTime);
      callbacksRef.current.onTimeUpdate?.(video.currentTime);
    };

    const onEnd = () => {
      setIsPlaying(false);
      callbacksRef.current.onEnded?.();
    };

    const onWaiting = () => {}; // pode adicionar spinner se quiser
    const onPlaying = () => setIsPlaying(true);

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnd);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);

    // Autoplay após pequeno delay
    const autoplayTimer = setTimeout(tryPlay, 100);

    return () => {
      clearTimeout(autoplayTimer);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnd);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
    };
  }, [src, startTime]);

  // ─── Fullscreen listener ───
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ─── Helpers ───
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    resetControlsTimer();
  };

  const skip = (sec: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + sec));
    resetControlsTimer();
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (!video.muted && video.volume === 0) {
      video.volume = 1;
      setVolume(1);
    }
    resetControlsTimer();
  };

  const changeVolume = (val: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    video.muted = val === 0;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "00:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 h-screen w-screen overflow-hidden bg-black"
      onClick={togglePlay}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
    >
      {/* Vídeo: object-cover preenche a tela toda, sem barras pretas */}
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        poster={poster}
        playsInline
        muted={isMuted}
        preload="auto"
        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
      />

      {/* Botão play central (quando pausado) */}
      {!isPlaying && (
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 text-white shadow-2xl transition active:scale-95"
        >
          <svg className="h-7 w-7 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      )}

      {/* Overlay de controles */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-4 pt-16 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de progresso */}
        <div className="mb-2 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full"
            style={{
              background: `linear-gradient(to right, #dc2626 0%, #dc2626 ${progressPct}%, rgba(255,255,255,0.25) ${progressPct}%, rgba(255,255,255,0.25) 100%)`,
            }}
          />
        </div>

        {/* Botões */}
        <div className="flex items-center gap-3 text-white">
          <button onClick={togglePlay} className="text-xl">
            {isPlaying ? (
              <svg className="h-6 w-6 fill-white" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
            ) : (
              <svg className="h-6 w-6 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>

          <button onClick={() => skip(-10)} className="text-xs font-medium">⏪ 10</button>
          <button onClick={() => skip(10)} className="text-xs font-medium">10 ⏩</button>

          <button onClick={toggleMute} className="text-lg">
            {isMuted ? "🔇" : "🔊"}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="hidden w-16 sm:block"
            style={{ accentColor: "#dc2626" }}
          />

          <span className="ml-auto text-xs text-white/70">
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <button onClick={toggleFullscreen} className="text-lg">
            {isFullscreen ? "⛶" : "⛶"}
          </button>
        </div>
      </div>

      {/* Botão de som (quando mutado) - mobile */}
      {isMuted && isPlaying && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute right-3 top-3 z-20 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur"
        >
          🔇 Toque para ativar o som
        </button>
      )}
    </div>
  );
}
