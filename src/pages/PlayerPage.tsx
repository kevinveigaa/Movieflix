import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { BunnyPlayer } from '@/components/player/BunnyPlayer';
import { useUpsertHistory } from '@/hooks/useWatchHistory';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePlaybackSession } from '@/hooks/usePlaybackSession';
import { ChevronLeft, RotateCcw, Play, Clock, Star, Calendar, Film } from 'lucide-react';
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

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, subscription, loading } = useAuth();
  const { entitlements } = useEntitlements();
  const subscriptionActive = hasActiveSubscription(subscription);
  const { blocked, activeScreens } = usePlaybackSession(user?.id, entitlements.screens, subscriptionActive);

  const [movie, setMovie] = useState<Movie | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);
  const [error, setError] = useState("");

  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);
  const upsertHistory = useUpsertHistory();

  // Load movie data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) { setPageLoading(false); return; }

      try {
        const { data, error: dbError } = await supabase
          .from('movies')
          .select('*')
          .eq('id', id)
          .single();

        if (cancelled) return;

        if (dbError) {
          setError("Erro ao carregar o título.");
          setPageLoading(false);
          return;
        }

        if (data) {
          setMovie(data);
          setVideoUrl(data.video_url || "");

          if (user) {
            const { data: history } = await supabase
              .from('watch_history')
              .select('position_seconds, duration_seconds')
              .eq('user_id', user.id)
              .eq('movie_id', data.id)
              .maybeSingle();

            if (history && history.position_seconds > 10) {
              const pct = history.duration_seconds > 0
                ? history.position_seconds / history.duration_seconds
                : 0;
              if (pct < 0.95) {
                setResumePos(history.position_seconds);
                setShowResume(true);
              }
            }
          }
        } else {
          setError("Título não encontrado.");
        }
      } catch {
        setError("Erro inesperado ao carregar.");
      }
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
      movieId: movie.id,
      mediaType,
      title: movie.title,
      posterPath: movie.poster_url,
      backdropPath: movie.backdrop_url,
      positionSeconds: durRef.current > 0 ? Math.min(t, durRef.current) : t,
      durationSeconds: durRef.current || 0,
    });
  }, [movie, user, upsertHistory]);

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      if (posRef.current > 0) saveHistory(posRef.current);
    };
  }, [saveHistory]);

  // Periodic save
  useEffect(() => {
    const interval = setInterval(() => {
      if (posRef.current > 0 && posRef.current !== lastSavedRef.current) {
        saveHistory(posRef.current);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [saveHistory]);

  const handleTimeUpdate = useCallback((time: number) => {
    posRef.current = time;
  }, []);

  const handleReady = useCallback((duration: number) => {
    durRef.current = duration;
  }, []);

  const handleEnded = useCallback(() => {
    if (movie && user) saveHistory(durRef.current);
  }, [movie, user, saveHistory]);

  const handleResume = () => setShowResume(false);
  const handleRestart = () => {
    setResumePos(0);
    setShowResume(false);
  };

  // Format time helper
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Loading state
  if (loading || pageLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
          <p className="text-zinc-400 text-sm">Carregando player...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white p-8 text-center gap-4">
        <Film className="h-16 w-16 text-red-600 mb-2" />
        <h2 className="text-2xl font-bold">Conteúdo exclusivo 🔒</h2>
        <p className="text-zinc-400 max-w-md">Faça login para assistir filmes, séries e animes em alta qualidade.</p>
        <button onClick={() => navigate('/login')}
          className="rounded-xl bg-red-600 px-8 py-3 font-semibold hover:bg-red-700 transition hover:scale-105">
          Entrar
        </button>
      </div>
    );
  }

  // No subscription
  if (!subscriptionActive) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white p-8 text-center gap-4">
        <Film className="h-16 w-16 text-red-600 mb-2" />
        <h2 className="text-2xl font-bold">Assinatura necessária</h2>
        <p className="text-zinc-400 max-w-md">Você precisa de uma assinatura ativa para assistir conteúdo exclusivo.</p>
        <button onClick={() => navigate('/subscription')}
          className="rounded-xl bg-red-600 px-8 py-3 font-semibold hover:bg-red-700 transition hover:scale-105">
          Ver planos
        </button>
      </div>
    );
  }

  // Screen limit
  if (blocked) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white p-8 text-center gap-4">
        <Film className="h-16 w-16 text-red-600 mb-2" />
        <h2 className="text-2xl font-bold">Limite de telas atingido</h2>
        <p className="text-zinc-400">
          Seu plano permite <span className="text-white font-semibold">{entitlements.screens}</span> {entitlements.screens === 1 ? 'tela' : 'telas'} simultâneas.
          <br />Há <span className="text-white font-semibold">{activeScreens}</span> {activeScreens === 1 ? 'tela em uso' : 'telas em uso'} no momento.
        </p>
        <button onClick={() => navigate('/subscription')}
          className="rounded-xl bg-zinc-800 px-8 py-3 font-semibold hover:bg-zinc-700 transition">
          Fazer upgrade
        </button>
      </div>
    );
  }

  // Error loading movie
  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white p-8 text-center gap-4">
        <Film className="h-16 w-16 text-zinc-600 mb-2" />
        <h2 className="text-2xl font-bold">{error}</h2>
        <button onClick={() => navigate(-1)}
          className="rounded-xl bg-zinc-800 px-6 py-3 font-semibold hover:bg-zinc-700 transition flex items-center gap-2">
          <ChevronLeft className="h-5 w-5" /> Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20 hover:scale-105">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base sm:text-lg font-semibold">
            {movie?.title || 'Carregando...'}
          </h1>
          {movie && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {movie.year && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {movie.year}</span>}
              {movie.vote_average && <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500" /> {movie.vote_average}</span>}
              {movie.quality && <span className="text-zinc-500">{movie.quality}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Player Container */}
      <div className="relative w-full bg-black" style={{ minHeight: '100dvh' }}>
        {!videoUrl ? (
          <div className="flex h-screen flex-col items-center justify-center p-8 text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600 mb-2" />
            <h2 className="text-2xl font-bold">Vídeo não disponível</h2>
            <p className="text-zinc-400 max-w-md">
              Este título ainda não possui um vídeo associado. Tente novamente mais tarde.
            </p>
            <button onClick={() => navigate(-1)}
              className="rounded-xl bg-zinc-800 px-6 py-3 font-semibold hover:bg-zinc-700 transition flex items-center gap-2">
              <ChevronLeft className="h-5 w-5" /> Voltar
            </button>
          </div>
        ) : (
          <div className="w-full">
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
          </div>
        )}

        {/* Resume Dialog */}
        {showResume && movie && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-md">
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-zinc-900 p-6 sm:p-8 text-center shadow-2xl border border-zinc-800">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-600/20">
                <RotateCcw className="h-7 w-7 text-red-500" />
              </div>
              <h3 className="mb-1 text-xl font-bold">Continuar assistindo?</h3>
              <p className="mb-6 text-zinc-400 text-sm">
                Você parou em <span className="text-white font-semibold">{formatTime(resumePos)}</span> de <span className="text-white">{movie.title}</span>
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={handleResume}
                  className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 hover:scale-[1.02]">
                  <Play className="h-5 w-5" fill="white" />
                  Continuar de {formatTime(resumePos)}
                </button>
                <button onClick={handleRestart}
                  className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-6 py-3 font-semibold text-white transition hover:bg-zinc-700">
                  <RotateCcw className="h-4 w-4" />
                  Assistir do início
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Movie info below player */}
      {movie && (
        <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">{movie.title}</h2>
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
                <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                  {c}
                </span>
              ))}
            </div>
          )}
          <p className="text-zinc-300 leading-relaxed max-w-3xl">
            {movie.description || "Sinopse não disponível."}
          </p>
        </div>
      )}
    </div>
  );
}
