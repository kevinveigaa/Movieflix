import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film, Volume2, VolumeX } from 'lucide-react';

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, activeViewerProfile } = useAuth();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [volumeBoost, setVolumeBoost] = useState(1.5);
  const [isMuted, setIsMuted] = useState(false);
  const lastSaveRef = useRef(0);

  const videoUrl = movie?.video_url || '';
  const isBunny = useMemo(() => {
    return videoUrl.includes('bunnycdn') || videoUrl.includes('b-cdn.net') || videoUrl.includes('mediadelivery');
  }, [videoUrl]);

  function getEmbed(url: string) {
    const m = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (m) return 'https://iframe.mediadelivery.net/embed/723294/' + m[1] + '?autoplay=true&muted=false&preload=true&volume=100';
    return url;
  }

  // Salva progresso DIRETAMENTE no Supabase (mais confiável que mutation)
  const saveProgress = useCallback(async () => {
    if (!user || !movie || !movie.id) return;

    const video = videoRef.current;
    if (!video) return;

    const positionSeconds = Math.floor(video.currentTime);
    const durationSeconds = Math.floor(video.duration || 0);

    // Só salva se assistiu pelo menos 3 segundos
    if (positionSeconds < 3) return;
    // Não salva se já terminou (95%+)
    if (durationSeconds > 0 && positionSeconds / durationSeconds >= 0.95) return;
    // Evita salvar muito frequentemente (mínimo 5 segundos entre saves)
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;

    try {
      const profileId = activeViewerProfile?.id || null;

      // Procura se já existe registro
      let query = supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('movie_id', movie.id);

      if (profileId) query = query.eq('viewer_profile_id', profileId);
      else query = query.is('viewer_profile_id', null);

      const { data: existing } = await query.maybeSingle();

      const payload = {
        position_seconds: positionSeconds,
        duration_seconds: durationSeconds,
        title: movie.title,
        poster_path: movie.poster_url || null,
        backdrop_path: movie.backdrop_url || null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from('watch_history').update(payload).eq('id', existing.id);
      } else {
        const insert: any = {
          user_id: user.id,
          movie_id: movie.id,
          media_type: 'movie',
          title: movie.title,
          poster_path: movie.poster_url || null,
          backdrop_path: movie.backdrop_url || null,
          position_seconds: positionSeconds,
          duration_seconds: durationSeconds,
        };
        if (profileId) insert.viewer_profile_id = profileId;
        await supabase.from('watch_history').insert(insert);
      }
    } catch (e) {
      console.error('Erro ao salvar histórico:', e);
    }
  }, [user, movie, activeViewerProfile]);

  // Carrega o filme
  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }
      const { data } = await supabase.from('movies').select('*').eq('id', id).single();
      setMovie(data);
      setLoading(false);
    }
    load();
  }, [id]);

  // Salva progresso a cada 10 segundos + quando pausa + quando sai
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isBunny) return;

    const interval = setInterval(() => {
      saveProgress();
    }, 10000);

    const handlePause = () => saveProgress();
    const handleBeforeUnload = () => saveProgress();

    video.addEventListener('pause', handlePause);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      video.removeEventListener('pause', handlePause);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveProgress(); // último save ao sair
    };
  }, [isBunny, saveProgress]);

  // Web Audio API para boostar volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || isBunny) return;

    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaElementSource(video);
      const gainNode = audioCtx.createGain();
      gainNodeRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      video.volume = 1;
      gainNode.gain.value = volumeBoost;
    } catch (e) {
      video.volume = 1;
    }

    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, [movie, videoUrl, isBunny, volumeBoost]);

  // Atualiza o gain
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volumeBoost;
    }
  }, [volumeBoost, isMuted]);

  // BunnyCDN iframe volume
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !isBunny) return;

    const handleLoad = () => {
      iframe.contentWindow?.postMessage({ method: 'setVolume', value: 100 }, '*');
      iframe.contentWindow?.postMessage({ method: 'unmute' }, '*');
    };

    iframe.addEventListener('load', handleLoad);
    const t1 = setTimeout(handleLoad, 1000);
    const t2 = setTimeout(handleLoad, 3000);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [movie, isBunny]);

  // Teclas de atalho
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        saveProgress();
        navigate(-1);
      }
      if (e.key === ' ' || e.code === 'Space') {
        const video = videoRef.current;
        if (video && document.activeElement === document.body) {
          e.preventDefault();
          video.paused ? video.play() : video.pause();
        }
      }
      if (e.key === 'ArrowRight') {
        const video = videoRef.current;
        if (video) { e.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
      }
      if (e.key === 'ArrowLeft') {
        const video = videoRef.current;
        if (video) { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); }
      }
      if (e.key === 'f' || e.key === 'F') {
        const video = videoRef.current;
        if (video) {
          e.preventDefault();
          document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen();
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        setIsMuted((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, saveProgress]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent"/>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <Film className="h-16 w-16 text-red-600"/>
        <h2 className="text-2xl font-bold">Login necessario</h2>
        <button onClick={() => navigate('/login')} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Entrar</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header fixo */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={() => { saveProgress(); navigate(-1); }} className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold">{movie?.title || 'Player'}</h1>
      </div>

      {/* Player */}
      <div className="relative w-full bg-black pt-14">
        {isBunny ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <iframe
              ref={iframeRef}
              src={getEmbed(videoUrl)}
              className="absolute inset-0 w-full h-full border-0"
              allow="autoplay; fullscreen; encrypted-media"
              allowFullScreen
              title={movie?.title || 'Video'}
            />
          </div>
        ) : videoUrl ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              controls
              playsInline
              preload="auto"
              className="w-full h-full"
              style={{ backgroundColor: '#000', maxHeight: '80vh' }}
              poster={movie?.backdrop_url || movie?.poster_url}
            >
              <source src={videoUrl} type="video/mp4" />
            </video>
            {/* Controle de volume boost */}
            <div className="absolute bottom-16 right-4 flex items-center gap-2 bg-black/70 backdrop-blur rounded-full px-3 py-1.5">
              <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-red-500 transition">
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <span className="text-xs text-zinc-300">{isMuted ? 'Mudo' : `Vol ${Math.round(volumeBoost * 100)}%`}</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={volumeBoost}
                onChange={(e) => setVolumeBoost(parseFloat(e.target.value))}
                className="w-20 accent-red-600"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Video nao disponivel</h2>
          </div>
        )}
      </div>

      {/* Info do filme */}
      {movie && (
        <div className="px-4 py-6 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">{movie.title}</h2>
          <p className="text-zinc-300 leading-relaxed">{movie.description || 'Sem sinopse.'}</p>
        </div>
      )}
    </div>
  );
}
