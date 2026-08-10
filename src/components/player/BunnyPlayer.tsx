import { useEffect, useRef, useState } from "react";

interface Props {
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

function isBunnyCDN(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("bunnycdn") || u.includes("mediadelivery") || u.includes("b-cdn");
}

function isYouTube(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("youtube") || u.includes("youtu.be");
}

function isVimeo(url: string): boolean {
  return url.toLowerCase().includes("vimeo");
}

function bunnyEmbed(url: string): string {
  // Se já for iframe URL, retorna como está
  if (url.includes("iframe.mediadelivery.net/embed/")) return url;
  // Extrai libraryId e videoId da URL do BunnyCDN
  // Ex: https://video.bunnycdn.com/play/12345/abcd-efgh
  const m = url.match(/(\d+)\/([a-f0-9-]+)/i);
  if (m) return `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}`;
  // Fallback: tenta extrair da URL de playlist
  const m2 = url.match(/([a-f0-9-]{36})/i);
  if (m2) {
    // Tenta encontrar o library ID na URL
    const libMatch = url.match(/(\d{3,})/);
    const libId = libMatch ? libMatch[1] : "0";
    return `https://iframe.mediadelivery.net/embed/${libId}/${m2[1]}`;
  }
  return url;
}

function youtubeEmbed(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0`;
  return url;
}

function vimeoEmbed(url: string): string {
  const match = url.match(/vimeo\.com\/(\d+)/);
  if (match) return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
  return url;
}

export function BunnyPlayer({ src, poster, title, autoPlay = false, startTime = 0, className = "", onTimeUpdate, onReady, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  // BunnyCDN → iframe embed (SEMPRE, nunca trava)
  if (isBunnyCDN(src)) {
    const embedUrl = bunnyEmbed(src);
    return (
      <div className={`relative w-full bg-black ${className}`} style={{ aspectRatio: '16/9' }}>
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title || "Video"}
        />
      </div>
    );
  }

  // YouTube → iframe embed
  if (isYouTube(src)) {
    return (
      <div className={`relative w-full bg-black ${className}`} style={{ aspectRatio: '16/9' }}>
        <iframe
          src={youtubeEmbed(src)}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title || "Video"}
        />
      </div>
    );
  }

  // Vimeo → iframe embed
  if (isVimeo(src)) {
    return (
      <div className={`relative w-full bg-black ${className}`} style={{ aspectRatio: '16/9' }}>
        <iframe
          src={vimeoEmbed(src)}
          className="absolute inset-0 w-full h-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
          title={title || "Video"}
        />
      </div>
    );
  }

  // MP4 / WebM / HLS nativo → video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.muted = false;
    v.playsInline = true;
    v.preload = "auto";
    if (poster) v.poster = poster;
    v.src = src.trim();

    const onMeta = () => {
      onReady?.(v.duration || 0);
      if (startTime > 0 && startTime < (v.duration || 0)) v.currentTime = startTime;
      if (autoPlay) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    };
    const onTime = () => onTimeUpdate?.(v.currentTime);
    const onEnd = () => onEnded?.();
    const onErr = () => setError("Erro ao carregar vídeo.");

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnd);
    v.addEventListener("error", onErr);

    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnd);
      v.removeEventListener("error", onErr);
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [src, autoPlay, startTime, poster, onTimeUpdate, onReady, onEnded]);

  if (error) {
    return (
      <div className={`relative w-full bg-black flex items-center justify-center ${className}`} style={{ aspectRatio: '16/9' }}>
        <div className="text-center p-8">
          <p className="text-lg font-bold text-white">{error}</p>
          <p className="text-sm text-zinc-400 mt-2">Tente recarregar a página</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full bg-black ${className}`} style={{ aspectRatio: '16/9' }}>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full"
        style={{ backgroundColor: '#000' }}
      />
    </div>
  );
}

export default BunnyPlayer;
