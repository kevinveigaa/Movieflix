import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface UniversalVideoPlayerProps {
  src: string;
  autoPlay?: boolean;
  controls?: boolean;
  className?: string;
}

function getGoogleDriveId(url: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/i,
    /drive\.google\.com\/open\?id=([^&]+)/i,
    /drive\.google\.com\/uc\?.*id=([^&]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function isGoogleDriveUrl(url: string): boolean {
  return /(^|\/\/)drive\.google\.com\//i.test(url);
}

function getVideoType(url: string): "hls" | "video" | "mkv" {
  const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();

  if (cleanUrl.endsWith(".m3u8")) {
    return "hls";
  }

  if (cleanUrl.endsWith(".mkv")) {
    return "mkv";
  }

  return "video";
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

export function UniversalVideoPlayer({
  src,
  autoPlay = true,
  controls = true,
  className = "",
}: UniversalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const driveId = getGoogleDriveId(src);
  const isDrive = isGoogleDriveUrl(src);

  const resetControlsTimer = () => {
    setShowControls(true);

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    if (playing) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3000);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }

    resetControlsTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = Math.max(
      0,
      Math.min(video.duration || Infinity, video.currentTime + seconds)
    );

    resetControlsTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setMuted(video.muted);

    if (!video.muted && video.volume === 0) {
      video.volume = 1;
      setVolume(1);
    }
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.volume = value;
    video.muted = value === 0;

    setVolume(value);
    setMuted(value === 0);
  };

  const changeTime = (value: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = value;
    setCurrentTime(value);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

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

    if (!video) {
      return;
    }

    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !src || isDrive) {
      return;
    }

    setError("");
    setLoading(true);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const cleanUrl = src.trim();
    const type = getVideoType(cleanUrl);

    if (type === "mkv") {
      setLoading(false);
      setError(
        "Este navegador não reproduz MKV diretamente. Use MP4 ou HLS (M3U8)."
      );
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.removeAttribute("src");
    video.load();

    const handleLoadedMetadata = () => {
      setLoading(false);
      setDuration(video.duration);

      if (autoPlay) {
        video.play().catch(() => {});
      }
    };

    const handlePlay = () => {
      setPlaying(true);
      resetControlsTimer();
    };

    const handlePause = () => {
      setPlaying(false);
      setShowControls(true);

      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = () => {
      setPlaying(false);
      setShowControls(true);
    };

    const handleError = () => {
      setLoading(false);
      setError(
        "Não foi possível reproduzir este vídeo. Verifique se a URL aponta diretamente para o vídeo."
      );
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    if (type === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = cleanUrl;
        video.load();
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });

        hlsRef.current = hls;

        hls.loadSource(cleanUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);

          if (autoPlay) {
            video.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setLoading(false);
            setError(
              "Não foi possível carregar o vídeo HLS. Verifique se a URL M3U8 está pública."
            );
          }
        });
      } else {
        setLoading(false);
        setError("Este navegador não suporta reprodução HLS.");
      }
    } else {
      video.src = cleanUrl;
      video.load();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [src, autoPlay, isDrive]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  if (isDrive && driveId) {
    return (
      <div
        ref={containerRef}
        className={`relative aspect-video w-full overflow-hidden bg-black ${className}`}
      >
        <iframe
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
          title="MovieFlix Player"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex aspect-video w-full items-center justify-center rounded-xl bg-black p-6 text-center ${className}`}
      >
        <div className="max-w-xl">
          <div className="mb-4 text-4xl">!</div>

          <p className="text-lg font-semibold text-white">
            Não foi possível reproduzir
          </p>

          <p className="mt-2 text-sm text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`group relative aspect-video w-full overflow-hidden bg-black ${className}`}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => {
        if (playing) {
          setShowControls(false);
          setShowSettings(false);
        }
      }}
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        className="h-full w-full bg-black object-contain"
        onClick={togglePlay}
      />

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-purple-500" />

            <p className="mt-4 text-sm text-zinc-300">
              Carregando video...
            </p>
          </div>
        </div>
      )}

      {!loading && !playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-purple-600 text-3xl text-white shadow-2xl transition hover:scale-110 hover:bg-purple-500"
          aria-label="Reproduzir"
        >
          ▶
        </button>
      )}

      {controls && (
        <div
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pb-4 pt-12 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="mb-3">
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => changeTime(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-purple-500"
              aria-label="Progresso do vídeo"
            />
          </div>

          <div className="flex items-center gap-3 text-white">
            <button
              type="button"
              onClick={togglePlay}
              className="text-xl transition hover:text-purple-400"
              aria-label={playing ? "Pausar" : "Reproduzir"}
            >
              {playing ? "❚❚" : "▶"}
            </button>

            <button
              type="button"
              onClick={() => skip(-10)}
              className="text-sm font-medium transition hover:text-purple-400"
              aria-label="Voltar 10 segundos"
            >
              ↶ 10
            </button>

            <button
              type="button"
              onClick={() => skip(10)}
              className="text-sm font-medium transition hover:text-purple-400"
              aria-label="Avançar 10 segundos"
            >
              10 ↷
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="text-lg transition hover:text-purple-400"
              aria-label={muted ? "Ativar som" : "Silenciar"}
            >
              {muted || volume === 0 ? "🔇" : "🔊"}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(event) =>
                changeVolume(Number(event.target.value))
              }
              className="hidden w-20 cursor-pointer accent-purple-500 sm:block"
              aria-label="Volume"
            />

            <span className="min-w-fit text-xs text-zinc-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white sm:inline">
                HD
              </span>

              <button
                type="button"
                onClick={() => setShowSettings((value) => !value)}
                className="text-lg transition hover:text-purple-400"
                aria-label="Configurações"
              >
                ⚙
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="text-lg transition hover:text-purple-400"
                aria-label="Tela cheia"
              >
                ⛶
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute bottom-20 right-4 z-40 w-56 rounded-xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur">
          <div className="mb-3">
            <p className="text-sm font-semibold text-white">
              Qualidade
            </p>

            <button
              type="button"
              className="mt-2 flex w-full items-center justify-between rounded-lg bg-purple-600/20 px-3 py-2 text-left text-sm text-white"
            >
              <span>HD</span>
              <span className="text-xs text-purple-400">Atual</span>
            </button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-sm font-semibold text-white">
              Velocidade
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => changePlaybackRate(rate)}
                  className={`rounded-lg px-2 py-2 text-xs transition ${
                    playbackRate === rate
                      ? "bg-purple-600 text-white"
                      : "bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  {rate === 1 ? "Normal" : `${rate}x`}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="text-sm font-semibold text-white">
              Audio
            </p>

            <div className="mt-2 rounded-lg bg-purple-600/20 px-3 py-2 text-xs text-white">
              Portugues (Brasil)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
