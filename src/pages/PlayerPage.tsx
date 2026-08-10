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

/* Detecta o tipo de player */
function detectPlayer(url: string): { mode: "bunny-iframe" | "videojs" | "iframe" | "unknown"; src: string; poster?: string } {
  const u = url.trim();
  const lower = u.toLowerCase();

  // Bunny Stream embed direto
  const bunnyEmbed = u.match(/iframe\.mediadelivery\.net\/embed\/(\d+)\/([a-f0-9-]+)/i);
  if (bunnyEmbed) {
    return { mode: "bunny-iframe", src: `https://iframe.mediadelivery.net/embed/${bunnyEmbed[1]}/${bunnyEmbed[2]}?autoplay=true&preload=true&chromecast=true` };
  }

  // Bunny M3U8 → extrair videoId e tentar embed
  const bunnyM3u8 = u.match(/vz-([a-z0-9]+)\.b-cdn\.net\/([a-f0-9-]+)\/playlist\.m3u8/i);
  if (bunnyM3u8) {
    const libId = bunnyM3u8[1];
    const vidId = bunnyM3u8[2];
    return { mode: "bunny-iframe", src: `https://iframe.mediadelivery.net/embed/${libId}/${vidId}?autoplay=true&preload=true&chromecast=true` };
  }

  // Qualquer outra URL do Bunny
  if (lower.includes("bunny") || lower.includes("mediadelivery") || lower.includes("b-cdn.net")) {
    return { mode: "videojs", src: u };
  }

  // YouTube
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { mode: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&playsinline=1` };
  const yts = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (yts) return { mode: "iframe", src: `https://www.youtube.com/embed/${yts[1]}?autoplay=1&rel=0&playsinline=1` };

  // Vimeo
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return { mode: "iframe", src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&playsinline=1` };

  // Google Drive
  const gd = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return { mode: "iframe", src: `https://drive.google.com/file/d/${gd[1]}/preview` };

  // M3U8 ou MP4 → Video.js
  if (lower.endsWith(".m3u8") || lower.includes(".m3u8?") || lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.includes(".mp4?")) {
    return { mode: "videojs", src: u };
  }

  // Embed genérico
  if (u.includes("/embed/") || u.includes("/preview")) return { mode: "iframe", src: u };

  return { mode: "unknown", src: u };
}

/* Carrega Video.js do CDN */
function loadVideoJs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).videojs) { resolve(); return; }

    // CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdn.jsdelivr.net/npm/video.js@8.10.0/dist/video-js.min.css";
    document.head.appendChild(css);

    // JS
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/video.js@8.10.0/dist/video.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar Video.js"));
    document.head.appendChild(script);
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
  const [playerInfo, setPlayerInfo] = useState<{ mode: string; src: string; poster?: string }>({ mode: "unknown", src: "" });
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [videojsReady, setVideojsReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<any>(null);
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
          const detected = detectPlayer(data.video_url);
          setPlayerInfo(detected);
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

  // Inicializa Video.js
  useEffect(() => {
    if (playerInfo.mode !== "videojs" || !videoRef.current) return;
    let cancelled = false;

    async function init() {
      try {
        await loadVideoJs();
        if (cancelled) return;

        const videojs = (window as any).videojs;
        const video = videoRef.current!;

        // Configuração profissional escura
        const player = videojs(video, {
          html5: {
            vhs: {
              overrideNative: true,
              limitRenditionByPlayerDimensions: true,
              useDevicePixelRatio: true,
            },
          },
          controls: true,
          autoplay: true,
          muted: true,
          playsinline: true,
          preload: "auto",
          fluid: false,
          fill: true,
          responsive: true,
          aspectRatio: "16:9",
          controlBar: {
            children: [
              "playToggle",
              "skipBackward",
              "skipForward",
              "volumePanel",
              "currentTimeDisplay",
              "timeDivider",
              "durationDisplay",
              "progressControl",
              "liveDisplay",
              "seekToLive",
              "remainingTimeDisplay",
              "customControlSpacer",
              "playbackRateMenuButton",
              "chaptersButton",
              "descriptionsButton",
              "subsCapsButton",
              "audioTrackButton",
              "fullscreenToggle",
            ],
          },
        });

        playerRef.current = player;

        player.src({ src: playerInfo.src, type: playerInfo.src.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4" });

        if (movie?.poster_url) player.poster(movie.poster_url);

        player.ready(() => {
          if (cancelled) return;
          setVideojsReady(true);
          if (!showResume) {
            player.currentTime(resumePos);
          }
          player.play().catch(() => {});
        });

        player.on("timeupdate", () => {
          posRef.current = player.currentTime();
          if (Math.abs(player.currentTime() - lastSavedRef.current) >= 10) saveHistory(player.currentTime());
        });

        player.on("loadedmetadata", () => {
          durRef.current = player.duration();
        });

        player.on("ended", () => saveHistory(durRef.current));
        player.on("pause", () => saveHistory(posRef.current));

        player.on("error", () => {
          setErrorMsg("Erro ao reproduzir o vídeo.");
        });

      } catch (e) {
        if (!cancelled) setErrorMsg("Não foi possível carregar o player.");
      }
    }

    init();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [playerInfo.mode, playerInfo.src, movie?.poster_url, showResume, resumePos]);

  const saveHistory = useCallback((t: number) => {
    if (!movie || !user || t <= 0) return;
    if (durRef.current > 0 && t >= durRef.current - 2) return;
    lastSavedRef.current = t;
    const type = String(movie.type ?? "").toLowerCase();
    const mediaType: MediaType = ["series", "serie", "tv", "anime"].includes(type) ? "tv" : "movie";
    upsertHistory.mutate({ movieId: movie.id, mediaType, title: movie.title, posterPath: movie.poster_url, backdropPath: movie.backdrop_url, positionSeconds: durRef.current > 0 ? Math.min(t, durRef.current) : t, durationSeconds: durRef.current || 0 });
  }, [movie, user, upsertHistory]);

  useEffect(() => () => { if (posRef.current > 0) saveHistory(posRef.current); }, [saveHistory]);

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
      {/* Botão voltar */}
      <button onClick={() => navigate(-1)} className="absolute left-3 top-3 z-50 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-black/80 transition">
        <ArrowLeft size={16} />Voltar
      </button>

      {loadingVideo ? (
        <div className="flex h-full w-full items-center justify-center text-white">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
            <p className="mt-3 text-sm text-zinc-400">Carregando vídeo...</p>
          </div>
        </div>
      ) : !playerInfo.src ? (
        <div className="flex h-full w-full items-center justify-center text-center text-white">
          <div>
            <h2 className="text-xl font-semibold">Vídeo não encontrado</h2>
            <p className="mt-2 text-sm text-zinc-400">Este filme ainda não possui uma URL de vídeo.</p>
          </div>
        </div>
      ) : playerInfo.mode === "bunny-iframe" || playerInfo.mode === "iframe" ? (
        /* IFRAME - Bunny Stream oficial ou outros */
        <iframe
          src={playerInfo.src}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          title={movie?.title || "Player"}
        />
      ) : playerInfo.mode === "videojs" ? (
        /* VIDEO.JS - Player profissional */
        <div className="relative h-full w-full">
          <video
            ref={videoRef}
            className="video-js vjs-big-play-centered vjs-theme-city"
            playsInline
            preload="auto"
            data-setup="{}"
          />

          {/* Loading do Video.js */}
          {!videojsReady && !errorMsg && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-red-600" />
              <p className="mt-3 text-sm text-zinc-300">Iniciando player...</p>
            </div>
          )}

          {/* Erro */}
          {errorMsg && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 px-6 text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-lg font-semibold text-white">{errorMsg}</p>
              <p className="mt-2 text-sm text-zinc-400">Tente recarregar a página.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-white">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-lg font-semibold">Formato de vídeo não reconhecido</p>
          <p className="mt-2 text-sm text-zinc-400">A URL do vídeo não é suportada.</p>
        </div>
      )}

      {/* Overlay retomar */}
      {showResume && playerInfo.mode === "videojs" && !errorMsg && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg">
            <svg className="h-8 w-8 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <h2 className="text-xl font-bold text-white">Continuar assistindo?</h2>
          <p className="text-sm text-zinc-300">Você parou em <span className="font-semibold text-white">{fmt(resumePos)}</span></p>
          <div className="flex gap-3">
            <button onClick={() => { setShowResume(false); if (playerRef.current) { playerRef.current.currentTime(resumePos); playerRef.current.play(); } }} className="rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500">
              ▶ Retomar
            </button>
            <button onClick={() => setShowResume(false)} className="rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Do início
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
