import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { BunnyPlayer } from '@/components/player/BunnyPlayer';
import { useUpsertHistory } from '@/hooks/useWatchHistory';
import { ChevronLeft, RotateCcw, Play, Star, Calendar, Film } from 'lucide-react';
import type { MediaType } from '@/types';

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [movie, setMovie] = useState<any>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);

  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);
  const upsertHistory = useUpsertHistory();

  // Load movie
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) { setPageLoading(false); return; }
      try {
        const { data } = await supabase.from('movies').select('*').eq('id', id).single();
        if (cancelled) return;
        if (data) {
          setMovie(data);
          setVideoUrl(data.video_url || "");
          if (user) {
            const { data: history } = await supabase
              .from('watch_history').select('position_seconds, duration_seconds')
              .eq('user_id', user.id).eq('movie_id', data.id).maybeSingle();
            if (history && history.position_seconds > 10) {
              const pct = history.duration_seconds > 0 ? history.position_seconds / history.duration_seconds : 0;
              if (pct < 0.95) { setResumePos(history.position_seconds); setShowResume(true); }
            }
          }
        }
      } catch (e) { console.error(e); }
      setPageLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, user?.id]);

  // Save history
  const saveHistory = useCallback((t: number) => {
    if (!movie || !user || t <= 0) return;
    if (durRef.current > 0 && t >= durRef.current - 2) return;
    lastSavedRef.current = t;
    const type = String(movie.type ?? '').toLowerCase();
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

  const handleTimeUpdate = useCallback((time: number) => { posRef.current = time; }, []);
  const handleReady = useCallback((duration: number) => { durRef.current = duration; }, []);
  const handleEnded = useCallback(() => { if (movie && user) saveHistory(durRef.current); }, [movie, user, saveHistory]);

  if (authLoading || pageLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
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

      {/* Player */}
      <div className="relative w-full bg-black pt-16">
        {!videoUrl ? (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Vídeo não disponível</h2>
          </div>
        ) : (
          <BunnyPlayer
            src={videoUrl}
            poster={movie?.backdrop_url || movie?.poster_url}
            title={movie?.title}
            autoPlay={!showResume}
            startTime={showResume ? resumePos : 0}
            onTimeUpdate={handleTimeUpdate}
            onReady={handleReady}
            onEnded={handleEnded}
            className="w-full"
          />
        )}

        {/* Resume Dialog */}
        {showResume && movie && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-md">
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-zinc-900 p-6 text-center shadow-2xl border border-zinc-800">
              <RotateCcw className="mx-auto mb-4 h-12 w-12 text-red-600" />
              <h3 className="mb-1 text-xl font-bold">Continuar assistindo?</h3>
              <p className="mb-6 text-zinc-400 text-sm">
                Você parou em <span className="text-white font-semibold">{Math.floor(resumePos/60)}:{String(resumePos%60).padStart(2,'0')}</span>
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => setShowResume(false)} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700 transition">
                  <Play className="h-5 w-5" fill="white" /> Continuar
                </button>
                <button onClick={() => { setResumePos(0); setShowResume(false); }} className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-6 py-3 font-semibold text-white hover:bg-zinc-700 transition">
                  <RotateCcw className="h-4 w-4" /> Do início
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      {movie && (
        <div className="px-4 py-6 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">{movie.title}</h2>
          <p className="text-zinc-300 leading-relaxed">{movie.description || "Sinopse não disponível."}</p>
        </div>
      )}
    </div>
  );
}
