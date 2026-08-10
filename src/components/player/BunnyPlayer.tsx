import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Settings, Loader2, AlertCircle,
  PictureInPicture, PictureInPicture2
} from "lucide-react";

interface BunnyPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  startTime?: number;
  className?: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onEnded?: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function detectSourceType(src: string): "bunny-iframe" | "hls" | "mp4" | "iframe" | "unknown" {
  const u = src.trim().toLowerCase();
  if (u.includes("iframe.mediadelivery.net") || u.includes("bunnycdn")) return "bunny-iframe";
  if (u.includes(".m3u8") || u.includes("playlist")) return "hls";
  if (u.includes(".mp4") || u.includes(".webm") || u.includes(".mkv")) return "mp4";
  if (u.includes("youtube") || u.includes("youtu.be") || u.includes("vimeo") || u.includes("drive.google")) return "iframe";
  return "unknown";
}

function getBunnyEmbedUrl(url: string): string {
  if (url.includes("iframe.mediadelivery.net/embed/")) return url;
  const match = url.match(/(\d+)\/([a-f0-9-]+)/i);
  if (match) return `https://iframe.mediadelivery.net/embed/${match[1]}/${match[2]}`;
  return url;
}

export function BunnyPlayer({
  src,
  poster,
  title = "",
  autoPlay = true,
  startTime = 0,
  className = "",
  onTimeUpdate,
  onReady,
  onEnded,
}: BunnyPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onTimeUpdate, onReady, onEnded });
  callbacksRef.current = { onTimeUpdate, onReady, onEnded };

  const [sourceType] = useState(() => detectSourceType(src));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [pip, setPip] = useState(false);

  // ── Setup HLS / Native Video ──
  useEffect(() => {
    if (sourceType === "bunny-iframe" || sourceType === "iframe" || sourceType === "unknown") return;

    const video = videoRef.current;
    if (!video) return;

    setLoading(true);
    setError("");
    setCurrentTime(0);
    setDuration(0);

    const cleanSrc = src.trim();

    const setupVideo = () => {
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("webkit-playsinline", "true");
      video.preload = "auto";
      if (poster) video.poster = poster;

      const onLoaded = () => {
        setLoading(false);
        setDuration(video.duration);
        callbacksRef.current.onReady?.(video.duration);
        if (startTime > 0 && startTime < video.duration) {
          video.currentTime = startTime;
        }
        if (autoPlay) video.play().catch(() => {});
      };

      const onPlay = () => { setPlaying(true); setBuffering(false); };
      const onPause = () => setPlaying(false);
      const onTime = () => {
        setCurrentTime(video.currentTime);
        callbacksRef.current.onTimeUpdate?.(video.currentTime);
      };
      const onEnd = () => { setPlaying(false); callbacksRef.current.onEnded?.(); };
      const onWait = () => setBuffering(true);
      const onCanPlay = () => setBuffering(false);
      const onErr = () => {
        setLoading(false);
        setError("Não foi possível carregar o vídeo.");
      };

      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("timeupdate", onTime);
      video.addEventListener("ended", onEnd);
      video.addEventListener("waiting", onWait);
      video.addEventListener("canplay", onCanPlay);
      video.addEventListener("playing", onCanPlay);
      video.addEventListener("error", onErr);

      return () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("ended", onEnd);
        video.removeEventListener("waiting", onWait);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("playing", onCanPlay);
        video.removeEventListener("error", onErr);
      };
    };

    let cleanup: (() => void) | undefined;

    if (sourceType === "hls" && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.loadSource(cleanSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        cleanup = setupVideo();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setLoading(false);
          setError("Erro ao carregar stream HLS.");
        }
      });
    } else if (sourceType === "hls" && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = cleanSrc;
      cleanup = setupVideo();
    } else if (sourceType === "mp4") {
      video.src = cleanSrc;
      cleanup = setupVideo();
    } else {
      setLoading(false);
      setError("Formato de vídeo não suportado.");
    }

    return () => {
      if (cleanup) cleanup();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, sourceType, autoPlay, startTime, poster]);

  // ── Fullscreen ──
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── PIP ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => setPip(!!document.pictureInPictureElement);
    video.addEventListener("enterpictureinpicture", handler);
    video.addEventListener("leavepictureinpicture", handler);
    return () => {
      video.removeEventListener("enterpictureinpicture", handler);
      video.removeEventListener("leavepictureinpicture", handler);
    };
  }, [sourceType]);

  // ── Controls timer ──
  const resetControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (playing) {
      controlsTimer.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3500);
    }
  }, [playing]);

  // ── Actions ──
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
    setMuted(v.muted);
    if (!v.muted && v.volume === 0) { v.volume = 1; setVolume(1); }
    resetControls();
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
    resetControls();
  };

  const toggleFullscreen = async () => {
    const c = containerRef.current;
    if (!c) return;
    try {
      if (!document.fullscreenElement) await c.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
    resetControls();
  };

  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
    resetControls();
  };

  const changeRate = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
    resetControls();
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Bunny iframe mode ──
  if (sourceType === "bunny-iframe") {
    const embedUrl = getBunnyEmbedUrl(src);
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl ${className}`}>
        <iframe
          src={embedUrl}
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title || "Bunny Stream"}
        />
      </div>
    );
  }

  // ── Generic iframe mode (YouTube, Vimeo, Drive) ──
  if (sourceType === "iframe") {
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl ${className}`}>
        <iframe
          src={src}
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title || "Video"}
        />
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-950 flex items-center justify-center ${className}`}>
        <div className="text-center p-8">
          <AlertCircle className="mx-auto mb-3 h-14 w-14 text-red-500" />
          <p className="text-lg font-bold text-white">Não foi possível reproduzir</p>
          <p className="mt-2 text-sm text-zinc-400 max-w-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-all hover:scale-105"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // ── Native Video Player ──
  return (
    <div
      ref={containerRef}
      className={`group relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl ${className}`}
      onMouseMove={resetControls}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={togglePlay}
    >
      {/* Poster backdrop */}
      {poster && loading && (
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      )}

      <video
        ref={videoRef}
        playsInline
        preload="auto"
        className="relative z-10 h-full w-full object-contain"
        onDoubleClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
      />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-red-500" />
          <p className="mt-3 text-sm font-medium text-white/80">Carregando vídeo...</p>
        </div>
      )}

      {/* Buffering overlay */}
      {buffering && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 pointer-events-none">
          <Loader2 className="h-10 w-10 animate-spin text-red-500" />
        </div>
      )}

      {/* Big play button (center) */}
      {!playing && !loading && (
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 transition-opacity hover:bg-black/30"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600/90 shadow-lg backdrop-blur-sm transition-transform hover:scale-110">
            <Play className="h-10 w-10 text-white ml-1" fill="white" />
          </div>
        </button>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        <div className="relative px-4 pb-4 pt-8">
          {/* Progress bar */}
          <div className="group/progress mb-3 relative h-1.5 w-full cursor-pointer rounded-full bg-white/20 hover:h-2.5 transition-all">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-red-600 transition-all"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full bg-red-500 opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-md" />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="rounded-full p-2 text-white transition hover:bg-white/10 hover:text-red-400"
            >
              {playing ? <Pause className="h-6 w-6" fill="white" /> : <Play className="h-6 w-6" fill="white" />}
            </button>

            {/* Skip back */}
            <button onClick={() => skip(-10)} className="rounded-full p-2 text-white transition hover:bg-white/10 hover:text-red-400">
              <SkipBack className="h-5 w-5" />
            </button>

            {/* Skip forward */}
            <button onClick={() => skip(10)} className="rounded-full p-2 text-white transition hover:bg-white/10 hover:text-red-400">
              <SkipForward className="h-5 w-5" />
            </button>

            {/* Volume */}
            <div className="group/vol relative flex items-center">
              <button onClick={toggleMute} className="rounded-full p-2 text-white transition hover:bg-white/10 hover:text-red-400">
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <div className="w-0 overflow-hidden transition-all group-hover/vol:w-20 group-hover/vol:px-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer accent-red-500"
                />
              </div>
            </div>

            {/* Time */}
            <span className="ml-1 text-sm font-medium text-white/90 tabular-nums">
              {formatTime(currentTime)} <span className="text-white/50">/</span> {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Playback rate badge */}
            {playbackRate !== 1 && (
              <span className="rounded bg-red-600/80 px-2 py-0.5 text-xs font-bold text-white">
                {playbackRate}x
              </span>
            )}

            {/* Settings */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="rounded-full p-2 text-white transition hover:bg-white/10 hover:text-red-400"
              >
                <Settings className="h-5 w-5" />
              </button>
              {showSettings && (
                <div className="absolute bottom-full right-0 mb-2 w-40 rounded-xl bg-zinc-900/95 p-2 shadow-xl backdrop-blur-md border border-white/10">
                  <p className="px-2 py-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Velocidade</p>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changeRate(rate)}
                      className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
                        playbackRate === rate
                          ? "bg-red-600 text-white font-semibold"
                          : "text-white hover:bg-white/10"
                      }`}
                    >
                      {rate === 1 ? "Normal" : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* PIP */}
            {document.pictureInPictureEnabled && (
              <button onClick={togglePip} className="rounded-full p-2 text-white transition hover:bg-white/10 hover:text-red-400">
                {pip ? <PictureInPicture2 className="h-5 w-5" /> : <PictureInPicture className="h-5 w-5" />}
              </button>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="rounded-full p-2 text-white transition hover:bg-white/10 hover:text-red-400">
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Title overlay (top) */}
      {title && showControls && (
        <div className="absolute left-0 right-0 top-0 z-30 bg-gradient-to-b from-black/70 to-transparent px-4 pt-3 pb-6">
          <p className="text-sm font-semibold text-white/90 truncate">{title}</p>
        </div>
      )}
    </div>
  );
}

export default BunnyPlayer;
