import { useEffect, useRef, useCallback, useState } from "react";

interface Props {
  src: string;
  startTime?: number;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onPause?: () => void;
  onEnded?: () => void;
}

function getEmbedUrl(url: string): string | null {
  // YouTube
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`;
  // Google Drive
  const gd = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;
  // Vimeo
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1`;
  // Dailymotion
  const dm = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  if (dm) return `https://www.dailymotion.com/embed/video/${dm[1]}?autoplay=1`;
  return null;
}

function isDirectVideo(url: string): boolean {
  const u = url.toLowerCase();
  return u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.ogg') || u.endsWith('.m3u8') || u.endsWith('.mkv') || u.includes('.mp4?') || u.includes('.m3u8?');
}

export function VideoPlayer({ src, startTime = 0, poster, onTimeUpdate, onReady, onPause, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onTimeUpdate, onReady, onPause, onEnded });
  callbacksRef.current = { onTimeUpdate, onReady, onPause, onEnded };

  const [mode, setMode] = useState<'video' | 'iframe' | 'error'>('video');
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [errorMsg, setErrorMsg] = useState("");

  // Decide modo inicial
  useEffect(() => {
    const embed = getEmbedUrl(src);
    if (embed && !isDirectVideo(src)) {
      setMode('iframe');
    } else {
      setMode('video');
    }
  }, [src]);

  // Setup video element
  useEffect(() => {
    if (mode !== 'video') return;
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.removeAttribute("src");
    video.load();

    video.src = src;
    video.currentTime = startTime;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "true");
    video.preload = "auto";
    if (poster) video.poster = poster;

    let errorTimer: ReturnType<typeof setTimeout> | null = null;

    const onLoaded = () => {
      if (errorTimer) clearTimeout(errorTimer);
      setDuration(video.duration);
      callbacksRef.current.onReady?.(video.duration);
      video.play().catch(() => {});
    };

    const onPlay = () => setIsPlaying(true);
    const onPauseEv = () => { setIsPlaying(false); callbacksRef.current.onPause?.(); };
    const onTime = () => { setCurrentTime(video.currentTime); callbacksRef.current.onTimeUpdate?.(video.currentTime); };
    const onEnd = () => { setIsPlaying(false); callbacksRef.current.onEnded?.(); };
    const onErr = () => {
      setErrorMsg("Não foi possível carregar este vídeo nativamente.");
      const embed = getEmbedUrl(src);
      if (embed) setMode('iframe');
      else setMode('error');
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPauseEv);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnd);
    video.addEventListener("error", onErr);

    // Se não carregar em 10s, tenta iframe
    errorTimer = setTimeout(() => {
      if (video.readyState < 2) {
        const embed = getEmbedUrl(src);
        if (embed) setMode('iframe');
        else { setErrorMsg("O vídeo não carregou. Verifique a URL."); setMode('error'); }
      }
    }, 10000);

    return () => {
      if (errorTimer) clearTimeout(errorTimer);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPauseEv);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnd);
      video.removeEventListener("error", onErr);
    };
  }, [src, startTime, mode]);

  // Fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    if (!v.muted && v.volume === 0) { v.volume = 1; setVolume(1); }
    resetControls();
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const toggleFullscreen = async () => {
    const c = containerRef.current;
    if (!c) return;
    try { if (!document.fullscreenElement) await c.requestFullscreen(); else await document.exitFullscreen(); } catch {}
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "00:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const embedUrl = getEmbedUrl(src);

  return (
    <div ref={containerRef} className="fixed inset-0 z-0 h-screen w-screen overflow-hidden bg-black" onClick={togglePlay} onMouseMove={resetControls} onTouchStart={resetControls}>
      {/* MODO IFRAME */}
      {mode === 'iframe' && embedUrl && (
        <iframe
          src={embedUrl}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
          title="Player"
        />
      )}

      {/* MODO ERRO */}
      {mode === 'error' && (
        <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-white">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-lg font-semibold">Não foi possível reproduzir</p>
          <p className="mt-2 text-sm text-zinc-400">{errorMsg || "Verifique se a URL do vídeo está correta."}</p>
          {embedUrl && (
            <button onClick={(e) => { e.stopPropagation(); setMode('iframe'); }} className="mt-4 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
              Tentar player alternativo
            </button>
          )}
        </div>
      )}

      {/* MODO VIDEO NATIVO */}
      {mode === 'video' && (
        <>
          {/* object-contain = mostra o filme INTEIRO, sem zoom, sem cortar */}
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            playsInline
            muted={isMuted}
            preload="auto"
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          />

          {/* Play central */}
          {!isPlaying && (
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
              <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} className="hidden w-16 sm:block" style={{ accentColor: "#dc2626" }} />
              <span className="ml-auto text-xs text-white/70">{fmt(currentTime)} / {fmt(duration)}</span>
              <button onClick={toggleFullscreen} className="text-lg">{isFullscreen ? "⛶" : "⛶"}</button>
            </div>
          </div>

          {/* Botão ativar som */}
          {isMuted && isPlaying && (
            <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="absolute right-3 top-3 z-20 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
              🔇 Toque para ativar o som
            </button>
          )}
        </>
      )}
    </div>
  );
}
