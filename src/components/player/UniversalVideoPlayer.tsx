import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";

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
  /** Imagem exibida atrás do vídeo enquanto ele não tem frame (nunca fica só preto). */
  backdrop?: string | null;
  /** Altura maxima permitida pelo plano (ex.: 720, 1080, 2160) */
  maxHeight?: number;
  qualityLabel?: string;
  /** Posição (segundos) para iniciar o vídeo ("retomar de onde parou"). */
  initialTime?: number;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onPause?: () => void;
  onEnded?: () => void;
}

function getGoogleDriveId(url: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/i,
    /drive\.google\.com\/open\?id=([^&]+)/i,
    /drive\.google\.com\/uc\?.*id=([^&]+)/i,
    /drive\.usercontent\.google\.com\/download\?.*id=([^&]+)/i,
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
  return /(^|\/\/)(drive\.google\.com|drive\.usercontent\.google\.com)\//i.test(
    url
  );
}

function isDrivePreviewUrl(url: string): boolean {
  return /drive\.google\.com\/file\/d\/[^/]+\/preview/i.test(url);
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

/**
 * URLs de streaming direto do Google Drive (sem o player de preview, que
 * congela a tela preta após alguns segundos). A ordem importa:
 * 1) drive.usercontent (stream com suporte a Range, não trava),
 * 2) uc?export=download com confirm (sem página de verificação),
 * 3) uc?export=download simples.
 */
function buildDriveCandidates(driveId: string, originalSrc: string): string[] {
  const list: string[] = [];

  // Se o admin já cadastrou um link de download direto, ele é a melhor opção.
  if (
    isGoogleDriveUrl(originalSrc) &&
    !isDrivePreviewUrl(originalSrc) &&
    !/\/file\/d\//i.test(originalSrc)
  ) {
    list.push(originalSrc);
  }

  list.push(
    `https://drive.usercontent.google.com/download?id=${driveId}&export=download&authuser=0&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${driveId}&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${driveId}`
  );

  return Array.from(new Set(list));
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
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onTimeUpdate, onReady, onPause, onEnded });
  callbacksRef.current = { onTimeUpdate, onReady, onPause, onEnded };
  const playingRef = useRef(false);

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
  /** True quando o vídeo está sem progresso (buffer/travado) — evita tela preta sem explicação. */
  const [stalled, setStalled] = useState(false);

  const driveId = getGoogleDriveId(src);
  const isDrive = isGoogleDriveUrl(src);

  const driveCandidates = useMemo(
    () => (driveId ? buildDriveCandidates(driveId, src) : []),
    [src, driveId]
  );

  // Índice da fonte do Drive atualmente em uso (0 = primeira).
  const [driveSourceIdx, setDriveSourceIdx] = useState(0);
  // Todas as tentativas nativas falharam -> cai para o iframe de preview.
  const [driveUseIframe, setDriveUseIframe] = useState(false);

  const useIframe =
    isDrive && (driveUseIframe || driveCandidates.length === 0);

  const activeUrl = isDrive
    ? driveCandidates[Math.min(driveSourceIdx, driveCandidates.length - 1)] ??
      src
    : src;

  const stalledRef = useRef(false);
  stalledRef.current = stalled;
  playingRef.current = playing;

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

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    if (playingRef.current) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3000);
    }
  }, []);

  /** Troca para a próxima fonte do Drive preservando a posição atual. */
  const nextDriveSource = useCallback(() => {
    const video = videoRef.current;

    if (video && video.currentTime > 0 && Number.isFinite(video.currentTime)) {
      pendingSeekRef.current = video.currentTime;
    }

    if (driveSourceIdx < driveCandidates.length - 1) {
      setDriveSourceIdx((idx) => idx + 1);
      setStalled(false);
      setError("");
    } else {
      // Última tentativa nativa falhou: usa o iframe de preview do Drive.
      setDriveUseIframe(true);
      setStalled(false);
      setError("");
    }
  }, [driveSourceIdx, driveCandidates.length]);

  /** Recupera de travamento/tela preta: tenta tocar de novo ou troca de fonte. */
  const recover = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.error || stalledRef.current) {
      if (isDrive && driveCandidates.length > 0) {
        nextDriveSource();
      } else {
        video.load();
        video
          .play()
          .then(() => {
            setStalled(false);
            setError("");
          })
          .catch(() => {
            setStalled(false);
            setError(
              "Não foi possível reproduzir este vídeo. Tente novamente."
            );
          });
      }
      return;
    }

    if (video.paused) {
      video.play().catch(() => {});
    }
  }, [isDrive, driveCandidates.length, nextDriveSource]);

  const togglePlay = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    // Travado/erro: clicar não deve pausar para uma tela preta — recupera.
    if (stalledRef.current || video.error) {
      recover();
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

  /* ------------------- Carregamento da fonte ------------------- */
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !src || useIframe) {
      return;
    }

    setError("");
    setLoading(true);
    setPlaying(false);
    setStalled(false);
    setCurrentTime(0);
    setDuration(0);

    const cleanUrl = activeUrl.trim();
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
      callbacksRef.current.onReady?.(video.duration);

      // Aplica a posição de retomada (inicial ou escolhida pelo usuário).
      const target = pendingSeekRef.current ?? initialTime;
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
      setStalled(false);
      resetControlsTimer();
    };

    const handlePause = () => {
      setPlaying(false);
      setShowControls(true);
      callbacksRef.current.onPause?.();

      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
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

    const handleWaiting = () => {
      setStalled(true);
    };

    const handlePlaying = () => {
      setStalled(false);
    };

    const handleError = () => {
      setLoading(false);
      setStalled(false);

      // Para Google Drive: tenta a próxima fonte automaticamente.
      if (isDrive && driveCandidates.length > 0) {
        nextDriveSource();
        return;
      }

      setError(
        "Não foi possível reproduzir este vídeo. Verifique se a URL aponta diretamente para o vídeo."
      );
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
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

          if (maxHeight > 0) {
            const allowed = hls.levels
              .map((level, index) => ({ index, height: level.height ?? 0 }))
              .filter((level) => level.height === 0 || level.height <= maxHeight);

            if (allowed.length > 0 && allowed.length < hls.levels.length) {
              hls.autoLevelCapping = allowed[allowed.length - 1]!.index;
            }
          }

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
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [
    src,
    autoPlay,
    useIframe,
    isDrive,
    driveCandidates.length,
    nextDriveSource,
    maxHeight,
    initialTime,
    activeUrl,
    resetControlsTimer,
  ]);

  /* --------------- Detecção de travamento (tela preta) --------------- */
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !src || useIframe || error) {
      return;
    }

    let lastProgress = 0;
    let lastProgressAt = Date.now();
    let stalledAt: number | null = null;
    let frozenAt: number | null = null;

    const check = setInterval(() => {
      if (!video || video.error || video.ended) {
        return;
      }

      const now = Date.now();

      // Esperando buffer há tempo demais -> troca de fonte automaticamente.
      if (stalledAt && now - stalledAt > 4000) {
        stalledAt = null;
        if (isDrive && driveCandidates.length > 0) {
          nextDriveSource();
        }
        return;
      }

      // Tocando, mas o tempo não avança (congelou sem disparar eventos).
      if (
        !video.paused &&
        video.readyState >= 2 &&
        video.currentTime > 0 &&
        video.duration > 1 &&
        video.currentTime < video.duration - 1
      ) {
        if (Math.abs(video.currentTime - lastProgress) < 0.1) {
          if (!frozenAt) {
            frozenAt = now;
          } else if (now - frozenAt > 5000) {
            frozenAt = null;
            setStalled(true);
            if (isDrive && driveCandidates.length > 0) {
              nextDriveSource();
            }
          }
        } else {
          frozenAt = null;
          lastProgress = video.currentTime;
          lastProgressAt = now;
        }
      } else {
        frozenAt = null;
      }
    }, 500);

    const onWaiting = () => {
      stalledAt = Date.now();
      setStalled(true);
    };
    const onPlaying = () => {
      stalledAt = null;
      frozenAt = null;
      setStalled(false);
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("seeking", onPlaying);

    return () => {
      clearInterval(check);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("seeking", onPlaying);
    };
  }, [src, useIframe, error, isDrive, driveCandidates.length, nextDriveSource]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  /* ---------------- Fallback: iframe de preview do Drive ---------------- */
  if (useIframe && driveId) {
    return (
      <div
        ref={containerRef}
        className={`relative aspect-video w-full overflow-hidden bg-black ${className}`}
      >
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            aria-hidden
          />
        )}

        <iframe
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          className="relative z-10 h-full w-full border-0"
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

          {isDrive && (
            <button
              type="button"
              onClick={() => {
                setDriveUseIframe(true);
                setError("");
              }}
              className="mt-5 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
            >
              Abrir no player alternativo
            </button>
          )}
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
      {/* Fundo com a imagem do filme enquanto o vídeo não tem frame (nunca fica só preto). */}
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

      {loading && !stalled && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-brand-500" />

            <p className="mt-4 text-sm text-zinc-300">
              Carregando video...
            </p>
          </div>
        </div>
      )}

      {stalled && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-brand-500" />

            <p className="mt-4 text-sm font-semibold text-white">
              Recuperando vídeo...
            </p>

            <p className="mt-1 text-xs text-zinc-400">
              A imagem parou — estamos tentando outra fonte.
            </p>

            <button
              type="button"
              onClick={recover}
              className="mt-4 rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      )}

      {!loading && !playing && !stalled && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-3xl text-white shadow-2xl transition hover:scale-110 hover:bg-brand-500"
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
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-brand-500"
              aria-label="Progresso do vídeo"
            />
          </div>

          <div className="flex items-center gap-3 text-white">
            <button
              type="button"
              onClick={togglePlay}
              className="text-xl transition hover:text-brand-400"
              aria-label={playing ? "Pausar" : "Reproduzir"}
            >
              {playing ? "❚❚" : "▶"}
            </button>

            <button
              type="button"
              onClick={() => skip(-10)}
              className="text-sm font-medium transition hover:text-brand-400"
              aria-label="Voltar 10 segundos"
            >
              ↶ 10
            </button>

            <button
              type="button"
              onClick={() => skip(10)}
              className="text-sm font-medium transition hover:text-brand-400"
              aria-label="Avançar 10 segundos"
            >
              10 ↷
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="text-lg transition hover:text-brand-400"
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
              className="hidden w-20 cursor-pointer accent-brand-500 sm:block"
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
                className="text-lg transition hover:text-brand-400"
                aria-label="Configurações"
              >
                ⚙
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="text-lg transition hover:text-brand-400"
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
              className="mt-2 flex w-full items-center justify-between rounded-lg bg-brand-600/20 px-3 py-2 text-left text-sm text-white"
            >
              <span>HD</span>
              <span className="text-xs text-brand-400">Atual</span>
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
                      ? "bg-brand-600 text-white"
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

            <div className="mt-2 rounded-lg bg-brand-600/20 px-3 py-2 text-xs text-white">
              Portugues (Brasil)
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
