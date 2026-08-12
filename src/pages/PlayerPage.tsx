import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film, Volume2, VolumeX, Cast } from 'lucide-react';
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [volumeBoost, setVolumeBoost] = useState(1.5);
  const [isMuted, setIsMuted] = useState(false);
  const [showCastModal, setShowCastModal] = useState(false);
  const lastSaveRef = useRef(0);

  const movieRef = useRef<any>(null);
  const userRef = useRef<any>(null);
  const profileRef = useRef<any>(null);
  const isBunnyRef = useRef(false);
  const episodeIdRef = useRef<string | null>(null);

  useEffect(() => { movieRef.current = movie; }, [movie]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { profileRef.current = activeViewerProfile; }, [activeViewerProfile]);

  const videoUrl = movie?.video_url || '';
  const isBunny = useMemo(() => {
    const hasUuid = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i.test(videoUrl);
    const isBunnyDomain = videoUrl.includes('bunnycdn') || videoUrl.includes('b-cdn.net') || videoUrl.includes('mediadelivery');
    const isHls = videoUrl.endsWith('.m3u8') || videoUrl.includes('.m3u8');
    const result = isBunnyDomain && hasUuid && !isHls;
    isBunnyRef.current = result;
    return result;
  }, [videoUrl]);

  function getEmbed(url: string) {
    const m = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (m) return 'https://iframe.mediadelivery.net/embed/723294/' + m[1] + '?autoplay=true&muted=false&preload=true&volume=100';
    return url;
  }

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
      let query = supabase.from('watch_history').select('id').eq('user_id', u.id).eq('movie_id', m.id);
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
      const epId = episodeIdRef.current;
      if (epId) payload.episode_id = epId;

      if (existing) {
        await supabase.from('watch_history').update(payload).eq('id', existing.id);
      } else {
        const insert: any = {
          user_id: u.id, movie_id: m.id, media_type: 'movie', title: m.title,
          poster_path: m.poster_url || null, backdrop_path: m.backdrop_url || null,
          position_seconds: positionSeconds, duration_seconds: durationSeconds,
        };
        if (profileId) insert.viewer_profile_id = profileId;
        if (epId) insert.episode_id = epId;
        await supabase.from('watch_history').insert(insert);
      }
    } catch (e) {
      console.error('Erro ao salvar histórico:', e);
    }
  }

  // === CARREGAMENTO PRINCIPAL ===
  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }

      const episodeIdRaw = searchParams.get('episode');
      const episodeId = episodeIdRaw ? parseInt(episodeIdRaw, 10) : null;
      episodeIdRef.current = episodeIdRaw;

      console.log('[Player] Carregando:', { id, episodeId, episodeIdRaw });

      // --- CASO 1: Episódio específico na URL ---
      if (episodeId && !isNaN(episodeId)) {
        console.log('[Player] Modo episódio. ID:', episodeId);

        // Busca o episódio direto (sem join complexo)
        const { data: epData, error: epError } = await supabase
          .from('episodes')
          .select('*')
          .eq('id', episodeId)
          .maybeSingle();

        if (epError) {
          console.error('[Player] Erro Supabase episódio:', epError);
          setMsg({ tipo: 'erro', texto: 'Erro ao buscar episódio no banco de dados.' });
          setLoading(false);
          return;
        }

        if (!epData) {
          console.error('[Player] Episódio não existe. ID:', episodeId);
          setMsg({ tipo: 'erro', texto: 'Episódio não encontrado. Ele pode ter sido excluído.' });
          setLoading(false);
          return;
        }

        console.log('[Player] Episódio encontrado:', epData);

        // Busca a season separadamente
        const { data: seasonData } = await supabase
          .from('seasons')
          .select('*')
          .eq('id', epData.season_id)
          .maybeSingle();

        // Busca a série separadamente
        const seriesId = seasonData?.series_id || id;
        const { data: seriesData, error: seriesError } = await supabase
          .from('movies')
          .select('*')
          .eq('id', seriesId)
          .maybeSingle();

        if (seriesError || !seriesData) {
          console.error('[Player] Erro ao carregar série:', seriesError);
          setMsg({ tipo: 'erro', texto: 'Erro ao carregar série.' });
          setLoading(false);
          return;
        }

        if (!epData.video_url) {
          setMsg({ tipo: 'erro', texto: 'Este episódio não tem URL de vídeo cadastrada. Edite no painel admin.' });
          setLoading(false);
          return;
        }

        setMovie({
          ...seriesData,
          id: seriesData.id,
          title: `${seriesData.title || 'Série'} - T${seasonData?.season_number || '?'} E${epData.episode_number}: ${epData.title}`,
          video_url: epData.video_url,
          description: epData.description || seriesData.description,
          poster_url: epData.thumbnail_url || seriesData.poster_url,
          backdrop_url: seriesData.backdrop_url,
        });
        console.log('[Player] Episódio pronto para tocar');
        setLoading(false);
        return;
      }

      // --- CASO 2: Filme/Série sem episódio na URL ---
      console.log('[Player] Modo filme/série. ID:', id);
      const { data, error } = await supabase.from('movies').select('*').eq('id', id).maybeSingle();

      if (error) {
        console.error('[Player] Erro ao carregar filme:', error);
        setMsg({ tipo: 'erro', texto: `Erro ao carregar: ${error.message}` });
        setLoading(false);
        return;
      }

      if (!data) {
        setMsg({ tipo: 'erro', texto: 'Título não encontrado no catálogo.' });
        setLoading(false);
        return;
      }

      console.log('[Player] Título carregado:', data.title, '| video_url:', data.video_url, '| type:', data.type, '| media_type:', data.media_type);

      // Se for série e não tiver video_url próprio, busca primeiro episódio
      const isSeries = data.type === 'series' || data.type === 'tv' || data.type === 'anime' || data.media_type === 'tv' || (data.number_of_seasons > 0);
      if (isSeries && !data.video_url) {
        console.log('[Player] Série sem video_url. Buscando primeiro episódio...');

        // Busca todas as seasons desta série
        const { data: seasonsData } = await supabase
          .from('seasons')
          .select('*')
          .eq('series_id', data.id)
          .order('season_number', { ascending: true });

        if (!seasonsData || seasonsData.length === 0) {
          console.log('[Player] Nenhuma temporada encontrada');
          setMovie(data);
          setLoading(false);
          return;
        }

        // Busca episódios da primeira temporada
        const firstSeason = seasonsData[0];
        const { data: epsData } = await supabase
          .from('episodes')
          .select('*')
          .eq('season_id', firstSeason.id)
          .not('video_url', 'is', null)
          .order('episode_number', { ascending: true })
          .limit(1);

        if (epsData && epsData.length > 0 && epsData[0].video_url) {
          const firstEp = epsData[0];
          console.log('[Player] Primeiro episódio encontrado:', firstEp.title);
          setMovie({
            ...data,
            title: `${data.title || 'Série'} - T${firstSeason.season_number || '?'} E${firstEp.episode_number}: ${firstEp.title}`,
            video_url: firstEp.video_url,
            description: firstEp.description || data.description,
            poster_url: firstEp.thumbnail_url || data.poster_url,
          });
          episodeIdRef.current = String(firstEp.id);
          setLoading(false);
          return;
        }

        console.log('[Player] Nenhum episódio com video_url encontrado');
        setMovie(data);
        setLoading(false);
        return;
      }

      // Filme normal ou série com video_url próprio
      setMovie(data);
      setLoading(false);
    }

    load();

    const timeout = setTimeout(() => {
      setLoading((current) => {
        if (current) {
          console.warn('[Player] Timeout de segurança');
          return false;
        }
        return current;
      });
    }, 15000);

    return () => clearTimeout(timeout);
  }, [id, searchParams]);

  // HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (videoUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { console.log('[Player] HLS OK'); });
        hls.on(Hls.Events.ERROR, (event, data) => { console.error('[Player] HLS error:', data); });
        return () => { hls.destroy(); };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoUrl;
      }
    }
  }, [videoUrl]);

  // Resume time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resumeTime) return;
    const handleCanPlay = () => { video.currentTime = resumeTime; };
    video.addEventListener('canplay', handleCanPlay);
    if (video.readyState >= 2) video.currentTime = resumeTime;
    return () => video.removeEventListener('canplay', handleCanPlay);
  }, [resumeTime]);

  // Auto-save
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const interval = setInterval(() => { doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0)); }, 10000);
    const handlePause = () => { doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0)); };
    const handleBeforeUnload = () => { doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0)); };
    video.addEventListener('pause', handlePause);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      clearInterval(interval);
      video.removeEventListener('pause', handlePause);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    };
  }, []);

  // Volume boost
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
    } catch (e) { video.volume = 1; }
    return () => { if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close(); };
  }, [movie, videoUrl, isBunny, volumeBoost]);

  useEffect(() => { if (gainNodeRef.current) gainNodeRef.current.gain.value = isMuted ? 0 : volumeBoost; }, [volumeBoost, isMuted]);

  // Bunny iframe volume
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
    return () => { iframe.removeEventListener('load', handleLoad); clearTimeout(t1); clearTimeout(t2); };
  }, [movie, isBunny]);

  // Teclas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { const video = videoRef.current; if (video) doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0)); navigate(-1); }
      if (e.key === ' ' || e.code === 'Space') { const video = videoRef.current; if (video && document.activeElement === document.body) { e.preventDefault(); video.paused ? video.play() : video.pause(); } }
      if (e.key === 'ArrowRight') { const video = videoRef.current; if (video) { e.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); } }
      if (e.key === 'ArrowLeft') { const video = videoRef.current; if (video) { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); } }
      if (e.key === 'f' || e.key === 'F') { const video = videoRef.current; if (video) { e.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen(); } }
      if (e.key === 'm' || e.key === 'M') { setIsMuted((prev) => !prev); }
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

  if (msg) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-4">
        <Film className="h-16 w-16 text-red-600" />
        <h2 className="text-xl font-bold text-center">{msg.texto}</h2>
        <button onClick={() => navigate(-1)} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Voltar</button>
      </div>
    );
  }

  const handleCast = () => {
    const video = videoRef.current;
    if (!video) { setShowCastModal(true); return; }
    // Tenta ativar o espelhamento nativo do navegador (AirPlay/Chromecast)
    if ((video as any).webkitShowPlaybackTargetPicker) {
      (video as any).webkitShowPlaybackTargetPicker();
    } else {
      setShowCastModal(true);
    }
  };

  const handleBack = () => {
    const video = videoRef.current;
    if (video) doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0));
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={handleBack} className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold">{movie?.title || 'Player'}</h1>
      </div>

      <div className="relative w-full bg-black pt-14">
        {isBunny ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <iframe ref={iframeRef} src={getEmbed(videoUrl)} className="absolute inset-0 w-full h-full border-0" allow="autoplay; fullscreen; encrypted-media" allowFullScreen title={movie?.title || 'Video'} />
          </div>
        ) : videoUrl ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <video ref={videoRef} controls playsInline preload="auto" className="w-full h-full" style={{ backgroundColor: '#000', maxHeight: '80vh' }} poster={movie?.backdrop_url || movie?.poster_url}>
              <source src={videoUrl} type={videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
            </video>
          </div>
        ) : (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Video nao disponivel</h2>
            <p className="text-zinc-400 text-sm max-w-md">Este título não possui vídeo cadastrado. Se for uma série, certifique-se de que os episódios tenham URLs de vídeo no painel administrativo.</p>
            <button onClick={handleBack} className="rounded-xl bg-red-600 px-6 py-2 font-semibold text-sm">Voltar</button>
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="px-4 pt-4 max-w-5xl mx-auto">
          <button
            onClick={handleCast}
            className="flex items-center gap-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition"
          >
            <Cast className="h-4 w-4" />
            Espelhar na TV
          </button>
        </div>
      )}

      {/* Modal Espelhar na TV */}
      {showCastModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={() => setShowCastModal(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800">
              <Cast className="h-7 w-7 text-red-500" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-white">Espelhar na TV</h3>
            <p className="mb-6 text-sm text-zinc-400 leading-relaxed">
              Para espelhar na TV, use o menu nativo do seu dispositivo:
            </p>
            <ul className="mb-6 text-left text-sm text-zinc-300 space-y-2">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong className="text-white">iPhone/iPad:</strong> Toque no ícone <span className="text-white">AirPlay</span> nos controles do vídeo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong className="text-white">Android:</strong> Use o <span className="text-white">Google Cast</span> no menu do navegador</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong className="text-white">PC:</strong> Clique com o botão direito no vídeo → "Transmitir para dispositivo"</span>
              </li>
            </ul>
            <button
              onClick={() => setShowCastModal(false)}
              className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {movie && (
        <div className="px-4 py-6 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">{movie.title}</h2>
          <p className="text-zinc-300 leading-relaxed">{movie.description || 'Sem sinopse.'}</p>
        </div>
      )}
    </div>
  );
}
