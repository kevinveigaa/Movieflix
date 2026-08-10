import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useUpsertHistory } from '@/hooks/useWatchHistory';
import { ChevronLeft, RotateCcw, Play, Star, Calendar, Clock, Film, AlertCircle, Loader2 } from 'lucide-react';
import type { MediaType } from '@/types';

interface Movie {
  id: string;
  title: string;
  description?: string;
  year?: string;
  poster_url?: string;
  video_url?: string;
  backdrop_url?: string;
  vote_average?: number;
  category?: string | null;
  language?: string | null;
  quality?: string | null;
  duration?: number;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);
  const upsertHistory = useUpsertHistory();

  // Carrega filme
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) { setLoading(false); return; }
      try {
        const { data } = await supabase.from('movies').select('*').eq('id', id).single();
        if (cancelled) return;
        if (data) {
          setMovie(data);
          if (user) {
            const { data: history } = await supabase
              .from('watch_history').select('position_seconds, duration_seconds')
              .eq('user_id', user.id).eq('movie_id', data.id).maybeSingle();
            if (history && history.position_seconds > 10) {
              const pct = history.duration_seconds > 0 ? history.position_seconds / history.duration_seconds : 0;
              if (pct < 0.95) { setResumePos(history.position_seconds); setShowResume(true); }
            }
          }
        } else {
          setError("Filme não encontrado.");
        }
      } catch { setError("Erro ao carregar."); }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, user?.id]);

  // Setup video com HLS.js
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !movie?.video_url) return;

    setVideoReady(false);
    const url = movie.video_url;
    const isHLS = url.includes('.m3u8');

    // Limpa anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    v.pause();
    v.removeAttribute('src');
    v.load();

    const setupVideo = () => {
      v.muted = false;
      v.playsInline = true;
      v.preload = 'auto';
      if (movie.backdrop_url || movie.poster_url) {
        v.poster = movie.backdrop_url || movie.poster_url || '';
      }

      const onMeta = () => {
        durRef.current = v.duration || 0;
        setVideoReady(true);
        if (resumePos > 0 && !showResume) {
          v.currentTime = resumePos;
        }
      };

      const onCanPlay = () => {
        setVideoReady(true);
        if (!showResume && v.paused) {
          v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
        }
      };

      v.addEventListener('loadedmetadata', onMeta);
      v.addEventListener('canplay', onCanPlay);

      return () => {
        v.removeEventListener('loadedmetadata', onMeta);
        v.removeEventListener('canplay', onCanPlay);
      };
    };

    let cleanup: (() => void) | undefined;

    if (isHLS && typeof window !== 'undefined') {
      // Tenta carregar HLS.js dinamicamente
      import('hls.js').then((HlsModule) => {
        const Hls = HlsModule.default;
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            enableWorker: true,
          });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            cleanup = setupVideo();
            if (!showResume) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
          });
          hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
            if (data.fatal) {
              console.error('HLS error:', data);
              // Fallback para src direto
              v.src = url;
              cleanup = setupVideo();
            }
          });
        } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari nativo
          v.src = url;
          cleanup = setupVideo();
        } else {
          v.src = url;
          cleanup = setupVideo();
        }
      }).catch(() => {
        // HLS.js não carregou, tenta direto
        v.src = url;
        cleanup = setupVideo();
      });
    } else {
      v.src = url;
      cleanup = setupVideo();
    }

    return () => {
      if (cleanup) cleanup();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      v.pause();
      v.removeAttribute('src');
      v.load();
    };
  }, [movie, resumePos, showResume]);

  // Salva histórico
  const saveHistory = useCallback((t: number) => {
    if (!movie || !user || t <= 0) return;
    if (durRef.current > 0 && t >= durRef.current - 2) return;
    lastSavedRef.current = t;
    const type = String(movie.category ?? '').toLowerCase();
    const mediaType: MediaType = ['series', 'serie', 'tv', 'anime'].includes(type) ? 'tv' : 'movie';
    upsertHistory.mutate({
      movieId: movie.id, mediaType, title: movie.title,
      posterPath: movie.poster_url, backdropPath: movie.backdrop_url,
      positionSeconds: durRef.current > 0 ? Math.min(t, durRef.current) : t,
      durationSeconds: durRef.current || 0,
    });
  }, [movie, user, upsertHistory]);

  useEffect(() => {
    return () => { if (posRef.current > 0) saveHistory(posRef.current); };
  }, [saveHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (posRef.current > 0 && posRef.current !== lastSavedRef.current) saveHistory(posRef.current);
    }, 15000);
    return () => clearInterval(interval);
  }, [saveHistory]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v) posRef.current = v.currentTime;
  };

  const handleEnded = () => {
    if (movie && user && videoRef.current) {
      saveHistory(videoRef.current.duration || 0);
    }
  };

  const handleResume = () => {
    setShowResume(false);
    const v = videoRef.current;
    if (v) {
      v.currentTime = resumePos;
      v.play().catch(() => {});
    }
  };

  const handleRestart = () => {
    setShowResume(false);
    setResumePos(0);
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-red-600" />
          <p className="text-zinc-400 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <Film className="h-16 w-16 text-red-600" />
        <h2 className="text-2xl font-bold">Faça login para assistir</h2>
        <button onClick={() => navigate('/login')} className="rounded-xl bg-red-600 px-8 py-3 font-semibold hover:bg-red-700 transition">Entrar</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <AlertCircle className="h-16 w-16 text-red-600" />
        <h2 className="text-2xl font-bold">{error}</h2>
        <button onClick={() => navigate(-1)} className="rounded-xl bg-zinc-800 px-6 py-3 font-semibold hover:bg-zinc-700 transition flex items-center gap-2">
          <ChevronLeft className="h-5 w-5" /> Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{movie?.title || 'Carregando...'}</h1>
          {movie && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {movie.year && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {movie.year}</span>}
              {movie.vote_average && <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500" /> {movie.vote_average}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Video Player */}
      <div className="relative w-full bg-black pt-16">
        {!movie?.video_url ? (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Vídeo não disponível</h2>
            <p className="text-zinc-400">Este título ainda não possui um vídeo.</p>
          </div>
        ) : (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            {!videoReady && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80">
                <Loader2 className="h-10 w-10 animate-spin text-red-600 mb-3" />
                <p className="text-sm text-zinc-300">Carregando vídeo...</p>
              </div>
            )}
            <video
              ref={videoRef}
              controls
              playsInline
              preload="auto"
              className="w-full h-full"
              style={{ backgroundColor: '#000', maxHeight: '80vh' }}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
            />
          </div>
        )}

        {/* Resume Dialog */}
        {showResume && movie && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-md">
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-zinc-900 p-6 text-center shadow-2xl border border-zinc-800">
              <RotateCcw className="mx-auto mb-4 h-12 w-12 text-red-600" />
              <h3 className="mb-1 text-xl font-bold">Continuar assistindo?</h3>
              <p className="mb-6 text-zinc-400 text-sm">
                Você parou em <span className="text-white font-semibold">{formatTime(resumePos)}</span>
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={handleResume} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700 transition">
                  <Play className="h-5 w-5" fill="white" /> Continuar de {formatTime(resumePos)}
                </button>
                <button onClick={handleRestart} className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-6 py-3 font-semibold text-white hover:bg-zinc-700 transition">
                  <RotateCcw className="h-4 w-4" /> Assistir do início
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Movie Info */}
      {movie && (
        <div className="px-4 py-6 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">{movie.title}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400 mb-4">
            {movie.year && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {movie.year}</span>}
            {movie.vote_average && <span className="flex items-center gap-1"><Star className="h-4 w-4 text-yellow-500" /> {movie.vote_average}</span>}
            {movie.quality && <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs">{movie.quality}</span>}
            {movie.language && <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs">{movie.language}</span>}
            {movie.duration && <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {Math.floor(movie.duration / 60)} min</span>}
          </div>
          {movie.category && (
            <div className="flex flex-wrap gap-2 mb-4">
              {movie.category.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">{c}</span>
              ))}
            </div>
          )}
          <p className="text-zinc-300 leading-relaxed">{movie.description || "Sinopse não disponível."}</p>
        </div>
      )}
    </div>
  );
}
