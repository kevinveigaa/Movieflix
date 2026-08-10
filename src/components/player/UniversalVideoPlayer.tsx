import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface UniversalVideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
}

interface UniversalVideoPlayerProps {
  src: string;
  autoPlay?: boolean;
  controls?: boolean;
  className?: string;
  backdrop?: string | null;
  maxHeight?: number;
  qualityLabel?: string;
  initialTime?: number;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onPause?: () => void;
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

export const UniversalVideoPlayer = forwardRef<
  UniversalVideoPlayerHandle,
  UniversalVideoPlayerProps
>(function UniversalVideoPlayer(
  {
    src,
    autoPlay = true,
    controls = true,
    className = "",
    backdrop = null,
    maxHeight = 0,
    qualityLabel = "",
    initialTime = 0,
    onTimeUpdate,
    onReady,
    onPause,
    onEnded,
  }: UniversalVideoPlayerProps,
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onTimeUpdate, onReady, onPause, onEnded });
  callbacksRef.current = { onTimeUpdate, onReady, onPause, onEnded };
  const playingRef = useRef(false);
  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);

  useImperativeHandle(ref, () => ({
    play() {
      const video = videoRef.current;
      if (video) video.play().catch(() => {});
    },
    pause() {
      const video = videoRef.current;
      if (video) video.pause();
    },
    seek(seconds: number) {
      const video = videoRef.current;
      if (video && video.readyState >= 1) {
        video.currentTime = Math.max(0, seconds);
      } else {
        pendingSeekRef.current = Math.max(0, seconds);
      }
    },
  }));

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (playingRef.current) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3000);
    }
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    resetControlsTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
    resetControlsTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted && video.volume === 0) {
      video.volume = 1;
      setVolume(1);
    }
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
  };

  const changeTime = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen(false);
    }
  };

  const changePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  // Carregamento da fonte
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError("");
    setLoading(true);
    setPlaying(false);
    setBuffering(false);
    setCurrentTime(0);
    setDuration(0);

    const cleanUrl = src.trim();

    video.removeAttribute("src");
    video.load();
    video.src = cleanUrl;
    video.load();

    const handleLoadedMetadata = () => {
      setLoading(false);
      setDuration(video.duration);
      callbacksRef.current.onReady?.(video.duration);

      const target = pendingSeekRef.current ?? initialTimeRef.current;
      pendingSeekRef.current = null;
      if (target > 0 && Number.isFinite(target) && target < video.duration) {
        video.currentTime = target;
        setCurrentTime(target);
      }

      if (autoPlay) {
        video.play().catch(() => {});
      }
    };

    const handlePlay = () => {
      setPlaying(true);
      setBuffering(false);
      playingRef.current = true;
      resetControlsTimer();
    };

    const handlePause = () => {
      setPlaying(false);
      setShowControls(true);
      playingRef.current = false;
      callbacksRef.current.onPause?.();
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      callbacksRef.current.onTimeUpdate?.(video.currentTime);
    };

    const handleEnded = () => {
      setPlaying(false);
      setShowControls(true);
      callbacksRef.current.onEnded?.();
    };

    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => setBuffering(false);
    const handleCanPlay = () => setBuffering(false);

    const handleError = () => {
      setLoading(false);
      setBuffering(false);
      setError("Não foi possível reproduzir este vídeo. Verifique se a URL está correta.");
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("error", handleError);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [src, autoPlay, resetControlsTimer]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  if (error) {
    return (
      <div className={`flex aspect-video w-full items-center justify-center rounded-xl bg-black p-6 text-center ${className}`}>
        <div className="max-w-xl">
          <div className="mb-4 text-4xl">⚠️</div>
          <p className="text-lg font-semibold text-white">Não foi possível reproduzir</p>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`group relative aspect-video w-full overflow-hidden rounded-xl bg-black ${className}`}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => {
        if (playing) {
          setShowControls(false);
          setShowSettings(false);
        }
      }}
    >
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
          aria-hidden
        />
      )}

      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        className="relative z-10 h-full w-full bg-black/0 object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {qualityLabel && showControls && (
        <span className="absolute right-4 top-4 z-20 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {qualityLabel}
        </span>
      )}

      {loading && !buffering && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
            <p className="mt-4 text-sm text-zinc-300">Carregando vídeo...</p>
          </div>
        </div>
      )}

      {buffering && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
            <p className="mt-4 text-sm font-semibold text-white">Recuperando vídeo...</p>
            <p className="mt-1 text-xs text-zinc-400">A imagem parou — estamos tentando outra fonte.</p>
          </div>
        </div>
      )}

      {!loading && !playing && !buffering && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-3xl text-white shadow-2xl transition hover:scale-110 hover:bg-red-500"
          aria-label="Reproduzir"
        >
          <svg className="h-8 w-8 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      )}

      {controls && (
        <div
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pb-4 pt-12 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {/* Barra de progresso */}
          <div className="mb-3">
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => changeTime(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-red-600"
              style={{
                background: `linear-gradient(to right, #dc2626 0%, #dc2626 ${(currentTime / (duration || 1)) * 100}%, #3f3f46 ${(currentTime / (duration || 1)) * 100}%, #3f3f46 100%)`
              }}
              aria-label="Progresso do vídeo"
            />
          </div>

          <div className="flex items-center gap-3 text-white">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="text-xl transition hover:text-red-500"
              aria-label={playing ? "Pausar" : "Reproduzir"}
            >
              {playing ? (
                <svg className="h-6 w-6 fill-white" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
              ) : (
                <svg className="h-6 w-6 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>

            {/* Voltar 10s */}
            <button
              type="button"
              onClick={() => skip(-10)}
              className="text-sm font-medium transition hover:text-red-500"
              aria-label="Voltar 10 segundos"
            >
              ⏪ 10
            </button>

            {/* Avançar 10s */}
            <button
              type="button"
              onClick={() => skip(10)}
              className="text-sm font-medium transition hover:text-red-500"
              aria-label="Avançar 10 segundos"
            >
              10 ⏩
            </button>

            {/* Mute */}
            <button
              type="button"
              onClick={toggleMute}
              className="text-lg transition hover:text-red-500"
              aria-label={muted ? "Ativar som" : "Silenciar"}
            >
              {muted || volume === 0 ? "🔇" : "🔊"}
            </button>

            {/* Volume */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="hidden w-20 cursor-pointer accent-red-600 sm:block"
              aria-label="Volume"
            />

            {/* Tempo */}
            <span className="min-w-fit text-xs text-zinc-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-3">
              {/* HD badge */}
              <span className="hidden rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white sm:inline">
                HD
              </span>

              {/* Configurações */}
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className="text-lg transition hover:text-red-500"
                aria-label="Configurações"
              >
                ⚙️
              </button>

              {/* Fullscreen */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="text-lg transition hover:text-red-500"
                aria-label="Tela cheia"
              >
                {fullscreen ? "⛶" : "⛶"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel de configurações */}
      {showSettings && showControls && (
        <div className="absolute bottom-20 right-4 z-40 w-56 rounded-xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur">
          <div className="mb-3">
            <p className="text-sm font-semibold text-white">Qualidade</p>
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-between rounded-lg bg-red-600/20 px-3 py-2 text-left text-sm text-white"
            >
              <span>HD</span>
              <span className="text-xs text-red-400">Atual</span>
            </button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-sm font-semibold text-white">Velocidade</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => changePlaybackRate(rate)}
                  className={`rounded-lg px-2 py-2 text-xs transition ${
                    playbackRate === rate
                      ? "bg-red-600 text-white"
                      : "bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  {rate === 1 ? "Normal" : `${rate}x`}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="text-sm font-semibold text-white">Áudio</p>
            <div className="mt-2 rounded-lg bg-red-600/20 px-3 py-2 text-xs text-white">
              Português (Brasil)
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
