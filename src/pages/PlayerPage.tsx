import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film } from 'lucide-react';
import Hls from 'hls.js';

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeTime = parseInt(searchParams.get('t') || '0', 10);
  const { user, loading: authLoading, activeViewerProfile } = useAuth();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);


  const lastSaveRef = useRef(0);

  // Refs para evitar stale closures no salvamento
  const movieRef = useRef<any>(null);
  const userRef = useRef<any>(null);
  const profileRef = useRef<any>(null);
  const isBunnyRef = useRef(false);
  const episodeIdRef = useRef<string | null>(null);

  // Sincroniza refs com estado
  useEffect(() => { movieRef.current = movie; }, [movie]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { profileRef.current = activeViewerProfile; }, [activeViewerProfile]);

  const videoUrl = movie?.video_url || '';
  const isBunny = useMemo(() => {
    // Só usa iframe Bunny se tiver UUID para embed (não é HLS direto)
    const hasUuid = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i.test(videoUrl);
    const isBunnyDomain = videoUrl.includes('bunnycdn') || videoUrl.includes('b-cdn.net') || videoUrl.includes('mediadelivery');
    const isHls = videoUrl.endsWith('.m3u8') || videoUrl.includes('.m3u8');
    // Se for HLS direto, não usa iframe (usa <video> tag)
    const result = isBunnyDomain && hasUuid && !isHls;
    isBunnyRef.current = result;
    return result;
  }, [videoUrl]);

  function getEmbed(url: string) {
    const m = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (m) return 'https://iframe.mediadelivery.net/embed/723294/' + m[1] + '?autoplay=true&muted=false&preload=true&volume=100';
    return url;
  }

  // Função de salvamento que lê das refs (sempre valor atual)
  async function doSave(positionSeconds: number, durationSeconds: number) {
    const m = movieRef.current;
    const u = userRef.current;
    if (!u || !m || !m.id) return;
    if (positionSeconds < 3) return;
    if (durationSeconds > 0 && positionSeconds / durationSeconds >= 0.95) return;

    const now = Date.now();
    if (now - lastSaveRef.current < 3000) return;
    lastSaveRef.current = now;

    try {
      const profileId = profileRef.current?.id || null;

      let query = supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', u.id)
        .eq('movie_id', m.id);

      if (profileId) query = query.eq('viewer_profile_id', profileId);
      else query = query.is('viewer_profile_id', null);

      const { data: existing } = await query.maybeSingle();

      const payload: any = {
        position_seconds: positionSeconds,
        duration_seconds: durationSeconds,
        title: m.title,
        poster_path: m.poster_url || null,
        backdrop_path: m.backdrop_url || null,
        updated_at: new Date().toISOString(),
      };

      // Se estiver assistindo um episódio, salva o episode_id
      const epId = episodeIdRef.current;
      if (epId) {
        payload.episode_id = epId;
      }

      if (existing) {
        await supabase.from('watch_history').update(payload).eq('id', existing.id);
      } else {
        const insert: any = {
          user_id: u.id,
          movie_id: m.id,
          media_type: 'movie',
          title: m.title,
          poster_path: m.poster_url || null,
          backdrop_path: m.backdrop_url || null,
          position_seconds: positionSeconds,
          duration_seconds: durationSeconds,
        };
        if (profileId) insert.viewer_profile_id = profileId;
        if (epId) insert.episode_id = epId;
        await supabase.from('watch_history').insert(insert);
      }
    } catch (e) {
      console.error('Erro ao salvar histórico:', e);
    }
  }

  // Carrega o filme/episódio e pula para o tempo salvo
  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }

      const episodeIdRaw = searchParams.get('episode');
      const episodeId = episodeIdRaw ? parseInt(episodeIdRaw, 10) : null;
      episodeIdRef.current = episodeIdRaw;

      console.log('[Player] Carregando:', { id, episodeId, episodeIdRaw });

      if (episodeId && !isNaN(episodeId)) {
        // Carregar episódio específico
        console.log('[Player] Buscando episódio ID:', episodeId);
        const { data: epData, error: epError } = await supabase
          .from('episodes')
          .select('*, seasons!inner(series_id, season_number)')
          .eq('id', episodeId)
          .single();

        if (epError) {
          console.error('[Player] Erro ao carregar episódio:', epError);
          setMsg({ tipo: 'erro', texto: `Episódio não encontrado. Ele pode ter sido excluído.` });
          setLoading(false);
          return;
        }

        if (epData) {
          console.log('[Player] Episódio encontrado:', epData);
          const { data: seriesData, error: seriesError } = await supabase
            .from('movies')
            .select('*')
            .eq('id', epData.seasons.series_id)
            .single();

          if (seriesError) {
            console.error('[Player] Erro ao carregar série:', seriesError);
            setMsg({ tipo: 'erro', texto: `Erro ao carregar série: ${seriesError.message}` });
            setLoading(false);
            return;
          }

          if (seriesData) {
            if (!epData.video_url) {
              setMsg({ tipo: 'erro', texto: 'Este episódio não tem URL de vídeo cadastrada. Edite no painel admin.' });
              setLoading(false);
              return;
            }
            setMovie({
              ...seriesData,
              id: seriesData.id,
              title: `${seriesData.title || 'Série'} - T${epData.seasons.season_number || '?'} E${epData.episode_number}: ${epData.title}`,
              video_url: epData.video_url,
              description: epData.description || seriesData.description,
              poster_url: epData.thumbnail_url || seriesData.poster_url,
              backdrop_url: seriesData.backdrop_url,
            });
            console.log('[Player] Filme setado com sucesso');
            setLoading(false);
            return;
          }
        }
      }

      // Fallback: carregar filme/série normal
      console.log('[Player] Fallback: carregando filme ID:', id);
      const { data, error } = await supabase.from('movies').select('*').eq('id', id).single();
      if (error) {
        console.error('[Player] Erro ao carregar filme:', error);
        setMsg({ tipo: 'erro', texto: `Erro ao carregar: ${error.message}` });
        setLoading(false);
        return;
      }
      if (data) {
        console.log('[Player] Filme carregado:', data.title);
        // Se for uma série (tem temporadas ou media_type tv) e não tem video_url próprio,
        // tenta carregar o primeiro episódio disponível
        const isSeries = data.media_type === 'tv' || data.number_of_seasons > 0 || data.number_of_episodes > 0;
        if (isSeries && !data.video_url) {
          console.log('[Player] Série sem video_url, buscando primeiro episódio...');
          const { data: firstEp, error: epErr } = await supabase
            .from('episodes')
            .select('*, seasons!inner(season_number)')
            .eq('seasons.series_id', data.id)
            .not('video_url', 'is', null)
            .order('season_number', { referencedTable: 'seasons', ascending: true })
            .order('episode_number', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (firstEp && firstEp.video_url) {
            console.log('[Player] Primeiro episódio encontrado:', firstEp);
            setMovie({
              ...data,
              title: `${data.title || 'Série'} - T${firstEp.seasons?.season_number || '?'} E${firstEp.episode_number}: ${firstEp.title}`,
              video_url: firstEp.video_url,
              description: firstEp.description || data.description,
              poster_url: firstEp.thumbnail_url || data.poster_url,
            });
            episodeIdRef.current = String(firstEp.id);
            setLoading(false);
            return;
          } else {
            console.log('[Player] Nenhum episódio com video_url encontrado');
            setMovie(data);
            setLoading(false);
            return;
          }
        }
        setMovie(data);
      }
      setLoading(false);
    }
    load();

    // Timeout de segurança: se loading ficar true por mais de 15 segundos, força false
    const timeout = setTimeout(() => {
      setLoading((current) => {
        if (current) {
          console.warn('[Player] Timeout de segurança ativado - forçando loading false');
          return false;
        }
        return current;
      });
    }, 15000);

    return () => clearTimeout(timeout);
  }, [id, searchParams]);

  // Inicializa hls.js para URLs HLS (.m3u8)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (videoUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[Player] HLS manifest parsed');
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('[Player] HLS error:', data);
        });
        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari nativo suporta HLS
        video.src = videoUrl;
      }
    }
  }, [videoUrl]);

  // Pula para o tempo salvo quando o vídeo estiver pronto
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resumeTime) return;

    const handleCanPlay = () => {
      video.currentTime = resumeTime;
    };

    video.addEventListener('canplay', handleCanPlay);
    // Se já estiver carregado
    if (video.readyState >= 2) {
      video.currentTime = resumeTime;
    }

    return () => video.removeEventListener('canplay', handleCanPlay);
  }, [resumeTime]);

  // === SALVAMENTO AUTOMÁTICO ===
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Salva a cada 10 segundos
    const interval = setInterval(() => {
      doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    }, 10000);

    // Salva quando pausa
    const handlePause = () => {
      doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    };

    // Salva quando fecha a aba
    const handleBeforeUnload = () => {
      doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    };

    video.addEventListener('pause', handlePause);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      video.removeEventListener('pause', handlePause);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Último save ao desmontar
      doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    };
  }, []); // Só roda uma vez - usa refs para dados atualizados


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
        const video = videoRef.current;
        if (video) {
          doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
        }
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
  }, [navigate]);

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

  // Renderiza mensagem de erro/info se existir
  if (msg) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-4">
        <Film className="h-16 w-16 text-red-600" />
        <h2 className="text-xl font-bold text-center">{msg.texto}</h2>
        <button onClick={() => navigate(-1)} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Voltar</button>
      </div>
    );
  }

  const handleBack = () => {
    const video = videoRef.current;
    if (video) {
      doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    }
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header fixo */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={handleBack} className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20">
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
              <source src={videoUrl} type={videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
            </video>

          </div>
        ) : (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Video nao disponivel</h2>
            <p className="text-zinc-400 text-sm max-w-md">
              Este título não possui vídeo cadastrado. Se for uma série, certifique-se de que os episódios tenham URLs de vídeo no painel administrativo.
            </p>
            <button onClick={handleBack} className="rounded-xl bg-red-600 px-6 py-2 font-semibold text-sm">Voltar</button>
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
