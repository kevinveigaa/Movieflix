import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import { getSources } from '@/lib/videoSources';
import Hls from 'hls.js';

/* ============================================================
   PlayerPage — reescrito do zero (v3)
   - Fallback automático entre fontes
   - Detecta iframe bloqueado e troca sozinho
   - Suporta vídeo nativo (MP4/HLS) e iframe
   - Salva histórico no Supabase
   ============================================================ */

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeTime = parseInt(searchParams.get('t') || '0', 10);
  const { user, activeViewerProfile } = useAuth();

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [playerState, setPlayerState] = useState<'loading' | 'playing' | 'blocked' | 'error'>('loading');
  const [autoSwitching, setAutoSwitching] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSave = useRef(0);
  const episodeIdRef = useRef<string | null>(null);

  /* ---------- CARREGAR FILME/SÉRIE ---------- */
  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }

      const epRaw = searchParams.get('episode');
      const epId = epRaw ? parseInt(epRaw, 10) : null;
      episodeIdRef.current = epRaw;

      // CASO 1: Episódio específico
      if (epId && !isNaN(epId)) {
        const { data: ep } = await supabase.from('episodes').select('*').eq('id', epId).maybeSingle();
        if (!ep || !ep.video_url) {
          setErrorMsg('Episódio não encontrado ou sem vídeo.');
          setLoading(false);
          return;
        }
        const { data: season } = await supabase.from('seasons').select('*').eq('id', ep.season_id).maybeSingle();
        const { data: series } = await supabase.from('movies').select('*').eq('id', season?.series_id || id).maybeSingle();
        if (!series) {
          setErrorMsg('Série não encontrada.');
          setLoading(false);
          return;
        }
        setMovie({
          ...series,
          title: `${series.title} — T${season?.season_number || '?'} E${ep.episode_number}: ${ep.title}`,
          video_url: ep.video_url,
          description: ep.description || series.description,
          poster_url: ep.thumbnail_url || series.poster_url,
          backdrop_url: series.backdrop_url,
        });
        setLoading(false);
        return;
      }

      // CASO 2: Filme/Série direto
      const { data, error } = await supabase.from('movies').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        setErrorMsg(error?.message || 'Título não encontrado.');
        setLoading(false);
        return;
      }

      // Se for série sem video_url, busca primeiro episódio
      const isSeries = data.type === 'series' || data.type === 'tv' || data.type === 'anime' || data.media_type === 'tv' || (data.number_of_seasons > 0);
      if (isSeries && !data.video_url) {
        const { data: seasons } = await supabase.from('seasons').select('*').eq('series_id', data.id).order('season_number', { ascending: true });
        if (seasons && seasons.length > 0) {
          const { data: eps } = await supabase
            .from('episodes')
            .select('*')
            .eq('season_id', seasons[0].id)
            .not('video_url', 'is', null)
            .order('episode_number', { ascending: true })
            .limit(1);
          if (eps && eps.length > 0 && eps[0].video_url) {
            setMovie({
              ...data,
              title: `${data.title} — T${seasons[0].season_number} E${eps[0].episode_number}: ${eps[0].title}`,
              video_url: eps[0].video_url,
              description: eps[0].description || data.description,
              poster_url: eps[0].thumbnail_url || data.poster_url,
            });
            episodeIdRef.current = String(eps[0].id);
            setLoading(false);
            return;
          }
        }
      }

      setMovie(data);
      setLoading(false);
    }

    load();
    const t = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(t);
  }, [id, searchParams]);

  /* ---------- FONTES DE VÍDEO ---------- */
  const sources = getSources({
    videoUrl: movie?.video_url,
    imdbId: movie?.imdb_id,
    tmdbId: movie?.tmdb_id,
    mediaType: movie?.type || movie?.media_type,
  });

  const currentSource = sources[sourceIndex] || null;
  const hasNextSource = sourceIndex < sources.length - 1;

  /* ---------- DETECTAR IFRAME BLOQUEADO ---------- */
  useEffect(() => {
    if (!currentSource) return;
    setPlayerState('loading');
    const timer = setTimeout(() => {
      setPlayerState((s) => (s === 'loading' ? 'blocked' : s));
    }, 10000);
    return () => clearTimeout(timer);
  }, [currentSource?.url]);

  /* ---------- FALLBACK AUTOMÁTICO ---------- */
  useEffect(() => {
    if ((playerState === 'blocked' || playerState === 'error') && hasNextSource && !autoSwitching) {
      setAutoSwitching(true);
      const t = setTimeout(() => {
        setSourceIndex((i) => i + 1);
        setPlayerState('loading');
        setAutoSwitching(false);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [playerState, hasNextSource, autoSwitching]);

  /* ---------- VÍDEO NATIVO (MP4/HLS) ---------- */
  const isDirectVideo = currentSource?.url ? /\.(mp4|m3u8|webm|mkv)(\?|#|$)/i.test(currentSource.url) : false;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentSource?.url || !isDirectVideo) return;

    if (currentSource.url.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(currentSource.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => setPlayerState('playing'));
      hls.on(Hls.Events.ERROR, () => setPlayerState('error'));
      return () => hls.destroy();
    } else {
      video.src = currentSource.url;
      video.oncanplay = () => setPlayerState('playing');
      video.onerror = () => setPlayerState('error');
    }
  }, [currentSource?.url, isDirectVideo]);

  // Resume time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resumeTime) return;
    const onReady = () => { video.currentTime = resumeTime; };
    video.addEventListener('canplay', onReady);
    if (video.readyState >= 2) onReady();
    return () => video.removeEventListener('canplay', onReady);
  }, [resumeTime]);

  /* ---------- SALVAR HISTÓRICO ---------- */
  const saveHistory = useCallback((pos: number, dur: number) => {
    if (!user || !movie?.id || pos < 3) return;
    if (dur > 0 && pos / dur >= 0.95) return;
    const now = Date.now();
    if (now - lastSave.current < 5000) return;
    lastSave.current = now;

    const payload = {
      position_seconds: pos,
      duration_seconds: dur,
      title: movie.title,
      poster_path: movie.poster_url || null,
      backdrop_path: movie.backdrop_url || null,
      updated_at: new Date().toISOString(),
    };

    supabase.from('watch_history')
      .select('id')
      .eq('user_id', user.id)
      .eq('movie_id', movie.id)
      .then(({ data: existing }) => {
        if (existing && existing.length > 0) {
          supabase.from('watch_history').update(payload).eq('id', existing[0].id).then(() => {});
        } else {
          supabase.from('watch_history').insert({
            user_id: user.id,
            movie_id: movie.id,
            media_type: 'movie',
            title: movie.title,
            poster_path: movie.poster_url || null,
            backdrop_path: movie.backdrop_url || null,
            position_seconds: pos,
            duration_seconds: dur,
            viewer_profile_id: activeViewerProfile?.id || null,
            episode_id: episodeIdRef.current,
          }).then(() => {});
        }
      });
  }, [user, movie, activeViewerProfile]);

  useEffect(() => {
    if (isDirectVideo) {
      const video = videoRef.current;
      if (!video) return;
      const interval = setInterval(() => saveHistory(Math.floor(video.currentTime), Math.floor(video.duration || 0)), 10000);
      const onPause = () => saveHistory(Math.floor(video.currentTime), Math.floor(video.duration || 0));
      video.addEventListener('pause', onPause);
      return () => { clearInterval(interval); video.removeEventListener('pause', onPause); };
    }
  }, [isDirectVideo, saveHistory]);

  /* ---------- TECLAS ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(-1);
      if (isDirectVideo) {
        const video = videoRef.current;
        if (!video) return;
        if (e.code === 'Space') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); video.currentTime += 10; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); video.currentTime -= 10; }
        if (e.key === 'f') { e.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, isDirectVideo]);

  /* ---------- RENDER ---------- */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <Film className="h-16 w-16 text-red-600" />
        <h2 className="text-2xl font-bold">Login necessário</h2>
        <button onClick={() => navigate('/login')} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Entrar</button>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-4">
        <Film className="h-16 w-16 text-red-600" />
        <h2 className="text-xl font-bold text-center">{errorMsg}</h2>
        <button onClick={() => navigate(-1)} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Voltar</button>
      </div>
    );
  }

  const handleBack = () => {
    const video = videoRef.current;
    if (video) saveHistory(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={handleBack} className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold">{movie?.title || 'Player'}</h1>
      </div>

      {/* Player */}
      <div className="relative w-full bg-black pt-14">
        {currentSource ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            {/* IFRAME */}
            {!isDirectVideo && playerState !== 'blocked' && playerState !== 'error' && (
              <iframe
                key={currentSource.url}
                ref={iframeRef}
                src={currentSource.url}
                className="absolute inset-0 w-full h-full border-0"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
                loading="eager"
                title={movie?.title || 'Vídeo'}
                onLoad={() => setPlayerState('playing')}
                onError={() => setPlayerState('error')}
              />
            )}

            {/* VÍDEO NATIVO */}
            {isDirectVideo && (
              <video
                ref={videoRef}
                controls
                playsInline
                preload="auto"
                className="w-full h-full"
                style={{ backgroundColor: '#000', maxHeight: '80vh' }}
                poster={movie?.backdrop_url || movie?.poster_url}
              >
                <source src={currentSource.url} type={currentSource.url?.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
              </video>
            )}

            {/* LOADING */}
            {playerState === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
                <Loader2 className="h-10 w-10 animate-spin text-red-600" />
                <p className="text-sm text-zinc-300">Carregando player ({currentSource.name})...</p>
                {sources.length > 1 && (
                  <p className="text-xs text-zinc-500">Fonte {sourceIndex + 1} de {sources.length}</p>
                )}
              </div>
            )}

            {/* BLOQUEADO / ERRO */}
            {(playerState === 'blocked' || playerState === 'error') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500" />
                <h3 className="text-lg font-bold">
                  {playerState === 'error' ? 'Erro ao carregar vídeo' : 'Fonte bloqueada'}
                </h3>
                <p className="max-w-md text-sm text-zinc-400">
                  A fonte <span className="text-zinc-200">{currentSource.name}</span> não está funcionando.
                  {hasNextSource && autoSwitching ? ' Tentando próxima fonte em 3s...' : ''}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <a
                    href={currentSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold"
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir em nova aba
                  </a>
                  {hasNextSource && !autoSwitching && (
                    <button
                      onClick={() => { setSourceIndex((i) => i + 1); setPlayerState('loading'); }}
                      className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/20"
                    >
                      Próxima fonte
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4 px-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Vídeo não disponível</h2>
            <p className="text-zinc-400 text-sm max-w-md">
              Este título não possui vídeo cadastrado. Se for uma série, certifique-se de que os episódios tenham URLs de vídeo no painel administrativo.
            </p>
            <button onClick={handleBack} className="rounded-xl bg-red-600 px-6 py-2 font-semibold text-sm">Voltar</button>
          </div>
        )}
      </div>

      {/* Info */}
      {movie && (
        <div className="px-4 py-6 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">{movie.title}</h2>
          <p className="text-zinc-300 leading-relaxed">{movie.description || 'Sem sinopse.'}</p>
        </div>
      )}
    </div>
  );
}
