import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { BunnyPlayer } from '@/components/player/BunnyPlayer';
import { useUpsertHistory } from '@/hooks/useWatchHistory';
import { hasActiveSubscription } from '@/lib/subscription';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePlaybackSession } from '@/hooks/usePlaybackSession';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import type { MediaType } from '@/types';

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, subscription, loading, activeViewerProfile } = useAuth();
  const { entitlements } = useEntitlements();
  const subscriptionActive = hasActiveSubscription(subscription);
  const { blocked, activeScreens } = usePlaybackSession(user?.id, entitlements.screens, subscriptionActive);

  const [movie, setMovie] = useState<any>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);

  const posRef = useRef(0);
  const durRef = useRef(0);
  const lastSavedRef = useRef(0);
  const upsertHistory = useUpsertHistory();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) { setPageLoading(false); return; }

      const { data } = await supabase.from('movies').select('*').eq('id', id).single();
      if (cancelled) return;

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
      }
      setPageLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, user?.id]);

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

  useEffect(() => {
    return () => {
      if (posRef.current > 0) saveHistory(posRef.current);
    };
  }, [saveHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (posRef.current > 0 && posRef.current !== lastSavedRef.current) {
        saveHistory(posRef.current);
      }
    }, 10000);
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) { navigate('/login'); return null; }

  if (!subscriptionActive) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Conteúdo exclusivo 🔒</h2>
        <p className="text-zinc-400 mb-6">Você precisa de uma assinatura ativa para assistir.</p>
        <button onClick={() => navigate('/subscription')}
          className="rounded-lg bg-red-600 px-6 py-3 font-semibold hover:bg-red-700 transition">
          Ver planos
        </button>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Limite de telas atingido</h2>
        <p className="text-zinc-400">
          Seu plano permite {entitlements.screens} {entitlements.screens === 1 ? 'tela' : 'telas'} e há {activeScreens} em uso.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-4 bg-gradient-to-b from-black/90 to-transparent p-4">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 rounded-full bg-black/50 p-2 backdrop-blur transition hover:bg-white/20">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="truncate text-lg font-semibold md:text-xl">
          {movie?.title || 'Carregando...'}
        </h1>
      </div>

      {/* Player */}
      <div className="relative flex h-screen w-full items-center justify-center bg-black">
        {pageLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
            <p className="text-zinc-400">Carregando vídeo...</p>
          </div>
        ) : !videoUrl ? (
          <div className="text-center p-8">
            <h2 className="text-2xl font-bold mb-2">Vídeo não encontrado</h2>
            <p className="text-zinc-400">Este título ainda não possui uma URL de vídeo.</p>
          </div>
        ) : (
          <div className="w-full h-full">
            <BunnyPlayer
              src={videoUrl}
              poster={movie?.backdrop_url || movie?.poster_url}
              title={movie?.title}
              autoPlay={!showResume}
              startTime={showResume ? 0 : resumePos}
              onTimeUpdate={handleTimeUpdate}
              onReady={handleReady}
              onEnded={handleEnded}
              className="h-full w-full"
            />
          </div>
        )}

        {/* Resume dialog */}
        {showResume && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="mx-4 max-w-md rounded-2xl bg-zinc-900 p-8 text-center shadow-2xl border border-zinc-800">
              <RotateCcw className="mx-auto mb-4 h-12 w-12 text-red-600" />
              <h3 className="mb-2 text-2xl font-bold">Continuar assistindo?</h3>
              <p className="mb-6 text-zinc-400">
                Você parou em {Math.floor(resumePos / 60)}:{String(resumePos % 60).padStart(2, '0')} de {movie?.title}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button onClick={handleResume}
                  className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 hover:scale-105">
                  Continuar
                </button>
                <button onClick={handleRestart}
                  className="rounded-lg bg-zinc-800 px-6 py-3 font-semibold text-white transition hover:bg-zinc-700">
                  Assistir do início
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
