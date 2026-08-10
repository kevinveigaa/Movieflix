import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward,
  Loader2, AlertCircle, Settings2
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

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function detectType(src: string): "bunny-iframe" | "hls" | "mp4" | "iframe" | "unknown" {
  const u = src.trim().toLowerCase();
  if (u.includes("iframe.mediadelivery.net") || u.includes("bunnycdn")) return "bunny-iframe";
  if (u.includes(".m3u8") || u.includes("playlist") || u.includes("master.m3u")) return "hls";
  if (u.includes(".mp4") || u.includes(".webm") || u.includes(".mkv") || u.includes(".mov")) return "mp4";
  if (u.includes("youtube") || u.includes("youtu.be") || u.includes("vimeo") || u.includes("drive.google")) return "iframe";
  if (u.startsWith("http://") || u.startsWith("https://")) return "mp4";
  return "unknown";
}

function bunnyEmbed(url: string): string {
  if (url.includes("iframe.mediadelivery.net/embed/")) return url;
  const m = url.match(/(\d+)\/([a-f0-9-]+)/i);
  if (m) return `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}`;
  return url;
}

export function BunnyPlayer({
  src, poster, title = "", autoPlay = true, startTime = 0,
  className = "", onTimeUpdate, onReady, onEnded,
}: BunnyPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef({ onTimeUpdate, onReady, onEnded });
  cbRef.current = { onTimeUpdate, onReady, onEnded };

  const [stype] = useState(() => detectType(src));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [curr, setCurr] = useState(0);
  const [dur, setDur] = useState(0);
  const [showCtrl, setShowCtrl] = useState(true);
  const [fs, setFs] = useState(false);
  const [buf, setBuf] = useState(false);
  const [rate, setRate] = useState(1);
  const [showSet, setShowSet] = useState(false);
  const [hoverVol, setHoverVol] = useState(false);
  const [bufferedEnd, setBufferedEnd] = useState(0);

  // Setup video
  useEffect(() => {
    if (stype === "bunny-iframe" || stype === "iframe") return;
    const v = videoRef.current;
    if (!v) return;

    setLoading(true); setError(""); setCurr(0); setDur(0); setBufferedEnd(0);
    const clean = src.trim();

    const setup = () => {
      v.muted = true; v.playsInline = true;
      v.setAttribute("webkit-playsinline", "true");
      v.preload = "auto";
      if (poster) v.poster = poster;

      const onMeta = () => {
        setLoading(false); setDur(v.duration);
        cbRef.current.onReady?.(v.duration);
        if (startTime > 0 && startTime < v.duration) v.currentTime = startTime;
        if (autoPlay) v.play().catch(()=>{});
      };
      const onPlay = () => { setPlaying(true); setBuf(false); };
      const onPause = () => setPlaying(false);
      const onTime = () => { 
        setCurr(v.currentTime); 
        if (v.buffered.length > 0) {
          setBufferedEnd(v.buffered.end(v.buffered.length - 1));
        }
        cbRef.current.onTimeUpdate?.(v.currentTime); 
      };
      const onEnd = () => { setPlaying(false); cbRef.current.onEnded?.(); };
      const onWait = () => setBuf(true);
      const onCan = () => setBuf(false);
      const onErr = () => { setLoading(false); setError("Erro ao carregar vídeo."); };
      const onProg = () => {
        if (v.buffered.length > 0) {
          setBufferedEnd(v.buffered.end(v.buffered.length - 1));
        }
      };

      v.addEventListener("loadedmetadata", onMeta);
      v.addEventListener("play", onPlay);
      v.addEventListener("pause", onPause);
      v.addEventListener("timeupdate", onTime);
      v.addEventListener("ended", onEnd);
      v.addEventListener("waiting", onWait);
      v.addEventListener("canplay", onCan);
      v.addEventListener("playing", onCan);
      v.addEventListener("error", onErr);
      v.addEventListener("progress", onProg);

      return () => {
        v.removeEventListener("loadedmetadata", onMeta);
        v.removeEventListener("play", onPlay);
        v.removeEventListener("pause", onPause);
        v.removeEventListener("timeupdate", onTime);
        v.removeEventListener("ended", onEnd);
        v.removeEventListener("waiting", onWait);
        v.removeEventListener("canplay", onCan);
        v.removeEventListener("playing", onCan);
        v.removeEventListener("error", onErr);
        v.removeEventListener("progress", onProg);
      };
    };

    let cleanup: (()=>void)|undefined;
    if (stype === "hls" && Hls.isSupported()) {
      const h = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, enableWorker: true });
      hlsRef.current = h;
      h.loadSource(clean); h.attachMedia(v);
      h.on(Hls.Events.MANIFEST_PARSED, () => { cleanup = setup(); });
      h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) { setLoading(false); setError("Erro HLS."); } });
    } else if (stype === "hls" && v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = clean; cleanup = setup();
    } else if (stype === "mp4" || stype === "unknown") {
      v.src = clean; cleanup = setup();
    } else {
      setLoading(false); setError("Formato não suportado.");
    }

    return () => {
      if (cleanup) cleanup();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      v.pause(); v.removeAttribute("src"); v.load();
    };
  }, [src, stype, autoPlay, startTime, poster]);

  // Fullscreen
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

      switch(e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (v.paused) v.play().catch(()=>{}); else v.pause();
          resetCtrl();
          break;
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
          resetCtrl();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          resetCtrl();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFs();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          v.muted = !v.muted;
          setMuted(v.muted);
          resetCtrl();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const newVolUp = Math.min(1, (v.volume || 0) + 0.1);
          v.volume = newVolUp; v.muted = newVolUp === 0;
          setVolume(newVolUp); setMuted(newVolUp === 0);
          resetCtrl();
          break;
        case 'ArrowDown':
          e.preventDefault();
          const newVolDown = Math.max(0, (v.volume || 0) - 0.1);
          v.volume = newVolDown; v.muted = newVolDown === 0;
          setVolume(newVolDown); setMuted(newVolDown === 0);
          resetCtrl();
          break;
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Controls timer
  const resetCtrl = useCallback(() => {
    setShowCtrl(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (playing) timerRef.current = setTimeout(() => { setShowCtrl(false); setShowSet(false); }, 4000);
  }, [playing]);

  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play().catch(()=>{}) : v.pause(); resetCtrl(); };
  const skip = (s: number) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration||Infinity, v.currentTime+s)); resetCtrl(); };
  const seek = (val: number) => { const v = videoRef.current; if (!v) return; v.currentTime = val; setCurr(val); };
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); if (!v.muted && v.volume===0) { v.volume=1; setVolume(1); } resetCtrl(); };
  const chgVol = (val: number) => { const v = videoRef.current; if (!v) return; v.volume = val; v.muted = val===0; setVolume(val); setMuted(val===0); resetCtrl(); };
  const toggleFs = async () => { const c = containerRef.current; if (!c) return; try { if (!document.fullscreenElement) await c.requestFullscreen(); else await document.exitFullscreen(); } catch {} resetCtrl(); };
  const chgRate = (r: number) => { const v = videoRef.current; if (!v) return; v.playbackRate = r; setRate(r); setShowSet(false); resetCtrl(); };

  const pct = dur > 0 ? (curr / dur) * 100 : 0;
  const bufPct = dur > 0 ? (bufferedEnd / dur) * 100 : 0;

  // Bunny iframe
  if (stype === "bunny-iframe") {
    return (
      <div className={`relative w-full overflow-hidden rounded-none bg-black aspect-video ${className}`}>
        <iframe src={bunnyEmbed(src)} className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={title||"Video"} />
      </div>
    );
  }

  // Generic iframe
  if (stype === "iframe") {
    return (
      <div className={`relative w-full overflow-hidden rounded-none bg-black aspect-video ${className}`}>
        <iframe src={src} className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={title||"Video"} />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className={`relative w-full bg-black flex items-center justify-center aspect-video ${className}`}>
        <div className="text-center p-8">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
          <p className="text-lg font-bold text-white">Não foi possível reproduzir</p>
          <p className="mt-1 text-sm text-zinc-400">{error}</p>
          <button onClick={()=>window.location.reload()} className="mt-4 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition">Tentar novamente</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} 
      className={`group relative w-full overflow-hidden bg-black select-none aspect-video ${className}`}
      onMouseMove={resetCtrl} 
      onMouseLeave={()=>playing&&setShowCtrl(false)} 
      onClick={togglePlay}>

      <video ref={videoRef} playsInline preload="auto" 
        className="h-full w-full object-contain"
        onDoubleClick={(e)=>{e.stopPropagation();toggleFs();}} />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60">
          <Loader2 className="h-10 w-10 animate-spin text-red-600" />
          <p className="mt-3 text-sm text-zinc-300 font-medium">Carregando vídeo...</p>
        </div>
      )}

      {/* Buffering */}
      {buf && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
        </div>
      )}

      {/* Top bar - title */}
      <div className={`absolute top-0 left-0 right-0 z-30 transition-all duration-500 ${showCtrl ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pt-3 pb-8">
          {title && (
            <h2 className="text-sm sm:text-base font-semibold text-white/90 truncate max-w-[70%]">{title}</h2>
          )}
        </div>
      </div>

      {/* Big play center */}
      {!playing && !loading && (
        <button onClick={(e)=>{e.stopPropagation();togglePlay();}}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 transition hover:bg-black/30">
          <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-red-600/90 shadow-2xl transition-all duration-300 hover:scale-110 hover:bg-red-500">
            <Play className="h-7 w-7 sm:h-9 sm:w-9 text-white ml-1" fill="white" />
          </div>
        </button>
      )}

      {/* Controls bar */}
      <div className={`absolute inset-x-0 bottom-0 z-30 transition-all duration-500 ${showCtrl ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
        onClick={(e)=>e.stopPropagation()}>

        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />

        <div className="relative px-3 sm:px-5 pb-3 sm:pb-4 pt-12">
          {/* Progress bar */}
          <div className="group/prog relative mb-4 h-1 w-full cursor-pointer sm:h-1.5">
            {/* Background */}
            <div className="absolute inset-0 rounded-full bg-white/20" />
            {/* Buffered */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/30 transition-all" style={{width: `${bufPct}%`}} />
            {/* Progress */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-red-600 transition-all" style={{width: `${pct}%`}}>
              <div className="absolute right-0 top-1/2 h-3 w-3 sm:h-4 sm:w-4 -translate-y-1/2 translate-x-1/2 rounded-full bg-red-500 opacity-0 group-hover/prog:opacity-100 transition-opacity shadow-lg ring-2 ring-white/20" />
            </div>
            <input type="range" min={0} max={dur||1} step={0.1} value={curr}
              onChange={(e)=>seek(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="rounded-full p-1.5 sm:p-2 text-white hover:text-red-400 transition hover:bg-white/10">
              {playing ? <Pause className="h-5 w-5 sm:h-6 sm:w-6" fill="white" /> : <Play className="h-5 w-5 sm:h-6 sm:w-6" fill="white" />}
            </button>

            {/* Skip back */}
            <button onClick={()=>skip(-10)} className="rounded-full p-1.5 sm:p-2 text-white hover:text-red-400 transition hover:bg-white/10">
              <SkipBack className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            {/* Skip forward */}
            <button onClick={()=>skip(10)} className="rounded-full p-1.5 sm:p-2 text-white hover:text-red-400 transition hover:bg-white/10">
              <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            {/* Volume */}
            <div className="relative flex items-center"
              onMouseEnter={()=>setHoverVol(true)} onMouseLeave={()=>setHoverVol(false)}>
              <button onClick={toggleMute} className="rounded-full p-1.5 sm:p-2 text-white hover:text-red-400 transition hover:bg-white/10">
                {muted||volume===0 ? <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" /> : <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${hoverVol?"w-16 sm:w-20 px-1":"w-0"}`}>
                <input type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e)=>chgVol(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer accent-red-600" />
              </div>
            </div>

            {/* Time */}
            <span className="ml-1 text-xs sm:text-sm font-medium text-white/90 tabular-nums">
              {fmt(curr)} <span className="text-white/40">/</span> {fmt(dur)}
            </span>

            <div className="flex-1" />

            {/* Title */}
            {title && (
              <span className="hidden md:block text-xs text-white/60 truncate max-w-[200px] mr-2">
                {title}
              </span>
            )}

            {/* Rate badge */}
            {rate !== 1 && (
              <span className="rounded bg-red-600/80 px-1.5 py-0.5 text-[10px] font-bold text-white">{rate}x</span>
            )}

            {/* Settings */}
            <div className="relative">
              <button onClick={()=>setShowSet(!showSet)} className="rounded-full p-1.5 sm:p-2 text-white hover:text-red-400 transition hover:bg-white/10">
                <Settings2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              {showSet && (
                <div className="absolute bottom-full right-0 mb-2 w-36 rounded-xl bg-zinc-900/95 p-2 shadow-2xl border border-white/10 backdrop-blur-sm">
                  <p className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Velocidade</p>
                  {[0.5,0.75,1,1.25,1.5,2].map(r=> (
                    <button key={r} onClick={()=>chgRate(r)}
                      className={`w-full rounded-lg px-3 py-1.5 text-left text-xs transition ${rate===r?"bg-red-600 text-white font-semibold":"text-white hover:bg-white/10"}`}>
                      {r===1?"Normal":`${r}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button onClick={toggleFs} className="rounded-full p-1.5 sm:p-2 text-white hover:text-red-400 transition hover:bg-white/10">
              {fs ? <Minimize className="h-4 w-4 sm:h-5 sm:w-5" /> : <Maximize className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BunnyPlayer;
