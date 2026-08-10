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

function detectType(src: string): "bunny-iframe" | "hls" | "mp4" | "iframe" | "unknown" {
  const u = src.trim().toLowerCase();
  if (u.includes("iframe.mediadelivery.net") || u.includes("bunnycdn")) return "bunny-iframe";
  if (u.includes(".m3u8")) return "hls";
  if (u.includes(".mp4") || u.includes(".webm")) return "mp4";
  if (u.includes("youtube") || u.includes("youtu.be") || u.includes("vimeo")) return "iframe";
  if (u.startsWith("http")) return "mp4";
  return "unknown";
}

function bunnyEmbed(url: string): string {
  if (url.includes("iframe.mediadelivery.net/embed/")) return url;
  const m = url.match(/(\d+)\/([a-f0-9-]+)/i);
  if (m) return `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}`;
  return url;
}

export function BunnyPlayer({ src, poster, title, autoPlay = false, startTime = 0, className = "", onTimeUpdate, onReady, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stype] = useState(() => detectType(src));
  const [error, setError] = useState("");

  useEffect(() => {
    if (stype === "bunny-iframe" || stype === "iframe") return;
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
  }, [src, stype, autoPlay, startTime, poster, onTimeUpdate, onReady, onEnded]);

  if (stype === "bunny-iframe" || stype === "iframe") {
    const embedUrl = stype === "bunny-iframe" ? bunnyEmbed(src) : src;
    return (
      <div className={`relative w-full bg-black ${className}`} style={{ aspectRatio: '16/9' }}>
        <iframe src={embedUrl} className="absolute inset-0 w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={title || "Video"} />
      </div>
    );
  }

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
