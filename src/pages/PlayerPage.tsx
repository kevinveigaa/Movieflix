import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useUpsertHistory } from '@/hooks/useWatchHistory';
import { ChevronLeft, RotateCcw, Play, Star, Calendar, Clock, Film, AlertCircle } from 'lucide-react';
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

function isBunnyCDN(url: string): boolean {
  return url.includes('bunnycdn') || url.includes('b-cdn.net') || url.includes('mediadelivery');
}

function getBunnyEmbedUrl(videoUrl: string): string {
  // Extrai o video UUID da URL do playlist
  // Ex: https://vz-b3c2a7fe-e98.b-cdn.net/b48df706-504d-49a1-b860-f346f2ba833d/playlist.m3u8
  const match = videoUrl.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (match) {
    return `https://iframe.mediadelivery.net/embed/723294/${match[1]}?autoplay=true&preload=true`;
  }
  return videoUrl;
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

  // Salva histórico (só para video nativo, iframe não dá pra trackar)
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

  const handleResume = () => setShowResume(false);
  const handleRestart = () => { setShowResume(false); setResumePos(0); };

  if (authLoading || loading) {
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

  const isBunny = movie?.video_url ? isBunnyCDN(movie.video_url) : false;
  const embedUrl = movie?.video_url ? getBunnyEmbedUrl(movie.video_url) : '';

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
        {!movie?.video_url ? (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Vídeo não disponível</h2>
          </div>
        ) : isBunny ? (
          /* BunnyCDN - iframe embed (sempre funciona) */
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={movie.title}
            />
          </div>
        ) : (
          /* MP4/WebM - video nativo */
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <video
              controls
              playsInline
              preload="auto"
              className="w-full h-full"
              style={{ backgroundColor: '#000', maxHeight: '80vh' }}
              poster={movie.backdrop_url || movie.poster_url}
            >
              <source src={movie.video_url} type="video/mp4" />
            </video>
          </div>
        )}

        {/* Resume Dialog - só mostra para video nativo, iframe não dá pra controlar */}
        {showResume && !isBunny && movie && (
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
