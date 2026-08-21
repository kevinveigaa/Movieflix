import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film, Volume2, VolumeX, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { resolverFontes } from '@/lib/videoSources';
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
  // Estado do player externo (iframe): carregando | ok | bloqueado
  const [embedStatus, setEmbedStatus] = useState<'loading' | 'ok' | 'blocked'>('loading');
  const [fonteIndex, setFonteIndex] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const lastSaveRef = useRef(0);

  const movieRef = useRef<any>(null);
  const userRef = useRef<any>(null);
  const profileRef = useRef<any>(null);
  const isEmbedRef = useRef(false);
  const episodeIdRef = useRef<string | null>(null);

  useEffect(() => { movieRef.current = movie; }, [movie]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { profileRef.current = activeViewerProfile; }, [activeViewerProfile]);

  const videoUrl = movie?.video_url || '';

  // Fontes de reprodução configuradas (ver src/lib/videoSources.ts)
  const fontes = useMemo(
    () => resolverFontes({ videoUrl, imdbId: movie?.imdb_id, tmdbId: movie?.tmdb_id }),
    [videoUrl, movie?.imdb_id, movie?.tmdb_id]
  );
  const fonteAtual = fontes[fonteIndex] || null;
  const temProximaFonte = fonteIndex < fontes.length - 1;

  /**
   * Detecta se o player externo conseguiu abrir.
   * Provedores que enviam X-Frame-Options/CSP (ex.: megaembedapi.site) nunca
   * disparam o evento `load` do iframe — o navegador aborta com
   * ERR_BLOCKED_BY_RESPONSE. Nesse caso mostramos o aviso, nunca tela branca.
   */
  useEffect(() => {
    if (!fonteAtual) return;
    if (!fonteAtual.embeddable) { setEmbedStatus('blocked'); return; }
    setEmbedStatus('loading');
    const timer = setTimeout(() => {
      setEmbedStatus((s) => (s === 'loading' ? 'blocked' : s));
    }, 12000);
    return () => clearTimeout(timer);
  }, [fonteAtual?.url, fonteAtual?.embeddable, tentativa]);


  // Arquivo de vídeo direto (o player nativo <video> consegue tocar).
  const ARQUIVO_DIRETO = /\.(mp4|m3u8|webm|mkv)(\?|#|$)/i;
  // Domínios de embed de terceiros (VDOHide, Bunny, etc.).
  const DOMINIOS_EMBED = ['vdohide', 'bunnycdn', 'b-cdn.net', 'mediadelivery', 'iframe.'];


  /** Bunny antigo: UUID do vídeo + domínio da Bunny → precisa virar iframe da mediadelivery. */
  function ehBunnyLegado(url: string) {
    const temUuid = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i.test(url);
    const dominioBunny = url.includes('bunnycdn') || url.includes('b-cdn.net') || url.includes('mediadelivery');
    return temUuid && dominioBunny;
  }

  /**
   * Qualquer embed de terceiro (VDOHide, Bunny, etc.) roda em iframe.
   * Arquivos diretos (MP4, HLS, WEBM, MKV) continuam no player nativo.
   */
  const isEmbed = useMemo(() => {
    if (!videoUrl) return false;
    const url = videoUrl.toLowerCase();
    const arquivoDireto = ARQUIVO_DIRETO.test(url);
    const result = url.includes('/embed/') || DOMINIOS_EMBED.some((d) => url.includes(d)) || !arquivoDireto;
    isEmbedRef.current = result;
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);


  /**
   * Provedores que permitem exibição direta dentro do site.
   * Qualquer outro passa pelo nosso proxy interno (/api/player), que serve o
   * conteúdo pelo próprio domínio — assim o vídeo nunca abre fora do site.
   */
  const EMBEDS_DIRETOS = ['mediadelivery', 'bunnycdn', 'b-cdn.net', 'vdohide'];

  function getEmbedUrl(url: string) {
    let alvo = url;
    if (ehBunnyLegado(url)) {
      const m = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (m) alvo = 'https://iframe.mediadelivery.net/embed/723294/' + m[1] + '?autoplay=true&muted=false&preload=true&volume=100';
    }
    const baixo = alvo.toLowerCase();
    // Provedores que já permitem iframe: link direto, sem proxy.
    if (EMBEDS_DIRETOS.some((d) => baixo.includes(d))) return alvo;
    // Nunca passar o próprio site pelo proxy (era o que causava o loop
    // "site dentro do site").
    try {
      const u = new URL(alvo, window.location.href);
      if (u.origin === window.location.origin) return alvo;
    } catch { /* ignora */ }
    // Qualquer outro link http(s) externo vai direto no iframe (o proxy
    // interno causava o loop de abrir o próprio site dentro do player).
    if (/^https?:\/\//i.test(alvo)) return alvo;
    return alvo;
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

  // Auto-save (só no player nativo: iframes de terceiros não expõem o progresso)
  useEffect(() => {
    if (isEmbed) return;
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
  }, [isEmbed]);

  // Volume boost
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || isEmbed) return;
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
  }, [movie, videoUrl, isEmbed, volumeBoost]);

  useEffect(() => { if (gainNodeRef.current) gainNodeRef.current.gain.value = isMuted ? 0 : volumeBoost; }, [volumeBoost, isMuted]);

  // Bunny iframe volume
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !isEmbed || !ehBunnyLegado(videoUrl)) return;
    const handleLoad = () => {
      iframe.contentWindow?.postMessage({ method: 'setVolume', value: 100 }, '*');
      iframe.contentWindow?.postMessage({ method: 'unmute' }, '*');
    };
    iframe.addEventListener('load', handleLoad);
    const t1 = setTimeout(handleLoad, 1000);
    const t2 = setTimeout(handleLoad, 3000);
    return () => { iframe.removeEventListener('load', handleLoad); clearTimeout(t1); clearTimeout(t2); };
  }, [movie, isEmbed, videoUrl]);

  // Teclas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { const video = videoRef.current; if (video) doSave(Math.floor(video.currentTime), Math.floor(video.duration || 0)); navigate(-1); }
      // Em embeds de terceiros os controles são do próprio player do iframe.
      if (isEmbedRef.current) return;
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
        {isEmbed && fonteAtual ? (
          <>
            <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
              {embedStatus !== 'blocked' && (
                <iframe
                  key={`${fonteAtual.url}-${tentativa}`}
                  ref={iframeRef}
                  src={getEmbedUrl(fonteAtual.url)}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                  loading="eager"
                  title={movie?.title || 'Video'}
                  onLoad={() => setEmbedStatus('ok')}
                  onError={() => setEmbedStatus('blocked')}
                />
              )}

              {embedStatus === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 pointer-events-none">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
                  <p className="text-sm text-zinc-300">Carregando player ({fonteAtual.name})...</p>
                </div>
              )}

              {embedStatus === 'blocked' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-500" />
                  <h3 className="text-lg font-bold">Esta fonte não permite reprodução dentro do site</h3>
                  <p className="max-w-md text-sm text-zinc-400">
                    O provedor <span className="text-zinc-200">{fonteAtual.name}</span> bloqueia a exibição em outros sites
                    (X-Frame-Options / CSP). Você pode abrir o player em uma nova aba
                    {temProximaFonte ? ' ou tentar a próxima fonte disponível.' : '.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <a
                      href={fonteAtual.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold"
                    >
                      <ExternalLink className="h-4 w-4" /> Abrir player em nova aba
                    </a>
                    <button
                      onClick={() => setTentativa((t) => t + 1)}
                      className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/20"
                    >
                      <RefreshCw className="h-4 w-4" /> Tentar novamente
                    </button>
                    {temProximaFonte && (
                      <button
                        onClick={() => { setFonteIndex((i) => i + 1); setTentativa((t) => t + 1); }}
                        className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/20"
                      >
                        Tentar próxima fonte
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {embedStatus !== 'blocked' && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-zinc-400">
                <span>Fonte: {fonteAtual.name}</span>
                <span className="flex items-center gap-3">
                  <button onClick={() => setEmbedStatus('blocked')} className="underline hover:text-white">
                    O vídeo não abriu?
                  </button>
                  <a href={fonteAtual.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline hover:text-white">
                    <ExternalLink className="h-3 w-3" /> Abrir em nova aba
                  </a>
                </span>
              </div>
            )}
          </>
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

      {movie && (
        <div className="px-4 py-6 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold mb-2">{movie.title}</h2>
          <p className="text-zinc-300 leading-relaxed">{movie.description || 'Sem sinopse.'}</p>
        </div>
      )}
    </div>
  );
}
