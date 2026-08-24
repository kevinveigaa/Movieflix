import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getVideoSources, getTvSource, normalizeDubbedSource } from '@/lib/videoSources';
import { streamBetterMovieUrl, streamBetterSeriesUrl } from '@/lib/strembetter';
import { useUpsertHistory, fetchHistoryForMovie } from '@/hooks/useWatchHistory';
import { useMovies } from '@/hooks/useMovies';
import { usePlaybackSession } from '@/hooks/usePlaybackSession';
import { useEntitlements } from '@/hooks/useEntitlements';
import { downloadVideo } from '@/lib/hlsDownload';
import { registerDownload, alreadyDownloaded } from '@/lib/downloads';
import Hls from 'hls.js';
import { ChevronLeft, ExternalLink, Film, Loader2, RefreshCw, Download, Lock, CheckCircle2, AlertCircle, RotateCcw, Play, Clock } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Player com suporte a DUBLAGEM pt-BR.
//
// O `video_url` do banco é a fonte de verdade. Quando ele aponta para uma
// fonte cujo áudio JÁ É dublado em pt-BR (YouTube "Filme Completo em
// Português", MP4/HLS dublado, Google Drive), o player renderiza a forma
// adequada:
//   - YouTube  → iframe oficial (youtube-nocookie) com hl=pt-BR
//   - MP4/HLS  → <video> nativo + hls.js (sem depender de iframe)
//   - Drive    → iframe de preview do Google Drive
//   - demais   → iframe genérico (VidZee etc., com hints pt-BR em
//                src/lib/videoSources.ts — melhor esforço)
//
// Para YouTube o timeout de "não carregou" é DESATIVADO: o iframe oficial
// nunca dispara eventos de load confiáveis e um vídeo dublado pode demorar
// para iniciar; mostrar erro falso seria pior do que aguardar.
//
// Progresso: o player nativo salva a posição real periodicamente (timeupdate)
// e ao pausar/terminar, alimentando a tabela watch_history (seção "Continuar
// assistindo"). Players embed (iframe cross-origin, ex.: StreamBetter) usam um
// contador local de tempo assistido, salvo a cada 20s, que começa na posição
// retomada pelo modal "Quer continuar de onde parou?".
//
// Download: botão condicionado ao plano (entitlements.downloads > 0). Apenas
// fontes diretas (MP4/HLS) são baixáveis; iframes mostram o botão bloqueado.
// ─────────────────────────────────────────────────────────────────────────────
const TIMEOUT_FONTE = 10000;
const YT_TIMEOUT_FONTE = 0; // desativado para YouTube
const SAVE_INTERVAL_MS = 20000; // salva progresso a cada 20s
const EMBED_START_MIN_SECONDS = 20; // mínimo de progresso para oferecer retomada
const EMBED_RESUME_MAX_PCT = 95; // acima disso o título é considerado concluído

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const upsertHistory = useUpsertHistory();
  const { entitlements } = useEntitlements();
  const movies = useMovies();
  const { blocked: telasBloqueadas, activeScreens } = usePlaybackSession(
    user?.id,
    entitlements.screens,
    Boolean(user) && entitlements.screens > 0,
  );

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Episódio atual (séries com ?season=&ep=).
  const [epAtual, setEpAtual] = useState<{ season: number; episode: number } | null>(null);

  // Única fonte de vídeo (fonte 1).
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  // True quando o timeout expirou (a fonte não carregou de verdade).
  const [esgotado, setEsgotado] = useState(false);
  // Tipo de reprodução da fonte atual.
  const [sourceKind, setSourceKind] = useState<'youtube' | 'drive' | 'direct' | 'iframe' | null>(null);

  // Estado do download.
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'done' | 'blocked' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastSavedRef = useRef(0);
  const embedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const embedLastTickRef = useRef(0);

  // Modal "Quer continuar de onde parou?" — mostrado ao reabrir um título que
  // já tem progresso salvo (embed). "Sim" retoma da posição salva; "Não"
  // zera o progresso e começa do início.
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [isResuming, setIsResuming] = useState(true);

  const currentUrl = sourceUrl;

  const limparTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reiniciarFonte = useCallback(() => {
    // Recarrega a fonte 1 do zero (nova key no iframe).
    setEsgotado(false);
    limparTimeout();
    if (currentUrl) {
      setSourceUrl(null);
      requestAnimationFrame(() => setSourceUrl(currentUrl));
    }
  }, [currentUrl, limparTimeout]);

  // Destrói o Hls ao trocar de fonte/desmontar.
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Monta a URL da fonte 1 a partir do banco + IDs (filme ou episódio/série).
  useEffect(() => {
    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }

      const epRaw = searchParams.get('episode');
      const seasonRaw = searchParams.get('season');
      const epParam = searchParams.get('ep');
      const epId = epRaw ? parseInt(epRaw, 10) : null;
      // Tempo de retomada ("Continuar assistindo"): ?t=segundos
      const tRaw = searchParams.get('t');
      const startSeconds = tRaw && !isNaN(Number(tRaw)) ? Number(tRaw) : undefined;

      // Série com episódio explícito via query (?season=&ep=): monta o embed.
      if (epId && !isNaN(epId)) {
        const tituloId = Number(id);
        const season = seasonRaw ? Number(seasonRaw) : 1;
        const episode = epParam ? Number(epParam) : epId;
        setMovie({ title: `Episódio ${episode}`, type: 'series', tmdb_id: tituloId });
        setEpAtual({ season, episode });
        const src = streamBetterSeriesUrl(tituloId || null, season, episode, startSeconds);
        setSourceUrl(src || null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from('movies').select('*').eq('id', id).maybeSingle();
      // Fallback: o catálogo do front (filmes/filmes.json + filmes/series.json)
      // usa id = String(tmdb_id), que não corresponde ao id numérico da tabela
      // `movies`. Quando a tabela não encontra o título, resolvemos pelo
      // catálogo (a fonte de verdade do front) para que o player funcione e o
      // histórico de reprodução seja gravado corretamente.
      let dataResolved: any = data;
      if (!dataResolved) {
        const catalog = movies.data ?? [];
        dataResolved =
          catalog.find((m) => String(m.id) === String(id)) ||
          catalog.find((m) => String(m.tmdb_id) === String(id)) ||
          null;
      }
      if (error || !dataResolved) {
        setErrorMsg(error?.message || 'Título não encontrado.');
        setLoading(false);
        return;
      }

      const isSeries = dataResolved.type === 'series' || dataResolved.type === 'tv' || dataResolved.type === 'anime' || dataResolved.media_type === 'tv' || (dataResolved.number_of_seasons > 0);
      if (isSeries && !dataResolved.video_url) {
        const { data: seasons } = await supabase.from('seasons').select('*').eq('series_id', dataResolved.id).order('season_number', { ascending: true });
        if (seasons && seasons.length > 0) {
          const { data: eps } = await supabase.from('episodes').select('*').eq('season_id', seasons[0].id).not('video_url', 'is', null).order('episode_number', { ascending: true }).limit(1);
          if (eps && eps.length > 0) {
            setMovie({ ...dataResolved, title: `${dataResolved.title} — T${seasons[0].season_number} E${eps[0].episode_number}: ${eps[0].title}` });
            const vidlink = getTvSource(dataResolved.tmdb_id, seasons[0].season_number || 1, eps[0].episode_number || 1);
            const lista = [eps[0].video_url, dataResolved.video_url, vidlink].filter(
              (u): u is string => Boolean(u),
            );
            setSourceUrl(lista.length > 0 ? lista[0] : null);
            setLoading(false);
            return;
          }
        }
      }

      setMovie(dataResolved);
      const tipo = (dataResolved.type === 'tv' || dataResolved.type === 'series' || dataResolved.type === 'anime' || dataResolved.media_type === 'tv') ? 'tv' : 'movie';
      const builtins = getVideoSources({
        imdbId: dataResolved.imdb_id,
        tmdbId: dataResolved.tmdb_id,
        mediaType: tipo,
      });
      // Fonte primária: `video_url` do banco (fontes comprovadamente dubladas
      // em pt-BR). O vidlink.pro (builtins) fica apenas como fallback — ele
      // não garante dublagem pt-BR (maioria dos títulos em MP4 com áudio EN).
      // Para títulos do catálogo (sem video_url direto), usa o embed do
      // StreamBetter (streamBetterMovieUrl) como fonte primária.
      const embedUrl = !dataResolved.video_url && dataResolved.tmdb_id
        ? streamBetterMovieUrl(dataResolved.tmdb_id, startSeconds)
        : null;
      const lista = [dataResolved.video_url, embedUrl, ...builtins].filter((u): u is string => Boolean(u));
      setSourceUrl(lista.length > 0 ? lista[0] : null);
      setLoading(false);
    }

    load();
  }, [id, searchParams, movies.data]);

  // Detecta o tipo de reprodução da fonte atual.
  useEffect(() => {
    const norm = currentUrl ? normalizeDubbedSource(currentUrl) : null;
    setSourceKind(norm ? norm.kind : 'iframe');
  }, [currentUrl]);

  // Reprodução nativa de MP4/HLS quando a fonte é direta.
  useEffect(() => {
    if (sourceKind !== 'direct' || !currentUrl || !videoRef.current) return;
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (currentUrl.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(currentUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => undefined);
      });
    } else {
      video.src = currentUrl;
      video.play().catch(() => undefined);
    }
  }, [sourceKind, currentUrl]);

  // Retoma de onde parou (?t=segundos) no player nativo.
  useEffect(() => {
    const t = searchParams.get('t');
    if (sourceKind !== 'direct' || !t || !videoRef.current) return;
    const secs = parseFloat(t);
    if (!Number.isFinite(secs) || secs <= 0) return;
    const trySeek = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.readyState >= 1) {
        try { v.currentTime = secs; } catch { /* ignora */ }
      } else {
        window.setTimeout(trySeek, 300);
      }
    };
    trySeek();
  }, [sourceKind, currentUrl, searchParams]);

  // Formata segundos como mm:ss (ex.: 30:00 para 1800s).
  const formatarTempo = useCallback((secs: number): string => {
    const s = Math.max(0, Math.floor(secs || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }, []);

  // ---- Salvar progresso ----

  // Grava o progresso do player nativo (MP4/HLS direto).
  const salvarProgresso = useCallback(() => {
    const video = videoRef.current;
    if (!video || !movie || !user) return;
    const now = Date.now();
    if (now - lastSavedRef.current < SAVE_INTERVAL_MS) return;
    lastSavedRef.current = now;
    const mediaType = (movie.type === 'series' || movie.type === 'tv' || movie.type === 'anime' || movie.media_type === 'tv') ? 'tv' : 'movie';
    upsertHistory.mutate({
      movieId: movie.id,
      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
      mediaType,
      title: movie.title,
      posterPath: movie.poster_url,
      backdropPath: movie.backdrop_url,
      positionSeconds: Math.floor(video.currentTime || 0),
      durationSeconds: Math.floor(video.duration || 0),
    });
  }, [movie, user, upsertHistory]);

  const salvarProgressoFinal = useCallback(() => {
    const video = videoRef.current;
    if (!video || !movie || !user) return;
    const mediaType = (movie.type === 'series' || movie.type === 'tv' || movie.type === 'anime' || movie.media_type === 'tv') ? 'tv' : 'movie';
    upsertHistory.mutate({
      movieId: movie.id,
      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
      mediaType,
      title: movie.title,
      posterPath: movie.poster_url,
      backdropPath: movie.backdrop_url,
      positionSeconds: Math.floor(video.currentTime || 0),
      durationSeconds: Math.floor(video.duration || 0),
    });
  }, [movie, user, upsertHistory]);

  // Grava o progresso estimado de players embed (iframe cross-origin):
  // a posição é o tempo salvo + o tempo decorrido desde que o embed carregou.
  // O contador só anda com a aba visível (document.hidden === false).
  const salvarProgressoEmbed = useCallback(() => {
    if (!movie || !user || !resumeBaseRef.current) return;
    const mediaType = (movie.type === 'series' || movie.type === 'tv' || movie.type === 'anime' || movie.media_type === 'tv') ? 'tv' : 'movie';
    const base = resumeBaseRef.current;
    const elapsed = document.hidden ? 0 : Math.floor((Date.now() - base.startedAt) / 1000);
    const position = base.position + elapsed;
    const duration = base.duration > 0 ? base.duration : 0;
    upsertHistory.mutate({
      movieId: movie.id,
      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
      mediaType,
      title: movie.title,
      posterPath: movie.poster_url,
      backdropPath: movie.backdrop_url,
      positionSeconds: position,
      durationSeconds: duration,
    });
  }, [movie, user, upsertHistory]);

  // Para o contador do embed (desmontagem, troca de fonte).
  const pararContadorEmbed = useCallback(() => {
    if (embedTimerRef.current !== null) {
      clearInterval(embedTimerRef.current);
      embedTimerRef.current = null;
    }
  }, []);

  // Guarda a base da retomada do embed: posição salva, duração e o instante em
  // que a contagem começou (0 = contagem pausada, ex.: modal aberto).
  const resumeBaseRef = useRef<{ position: number; duration: number; startedAt: number } | null>(null);

  // Players embed (iframe cross-origin — YouTube/Drive/StreamBetter):
  //  - Ao carregar, busca o progresso salvo desta obra no banco;
  //  - Se houver progresso relevante (>= 20s e < 95%), abre o modal
  //    "Quer continuar de onde parou?" — "Sim" inicia o contador na posição
  //    salva; "Não" zera o progresso e começa do início;
  //  - Um contador local (tick a cada segundo) estima a posição (posição base
  //    + tempo decorrido com a aba visível) e salva a cada 20s no histórico.
  useEffect(() => {
    if (!currentUrl || !movie || !user) return;
    if (sourceKind === 'direct') return; // o player nativo cuida do progresso
    pararContadorEmbed();

    // Começa pausado: o contador só anda depois da decisão do modal (ou já
    // direto, quando não há progresso para retomar).
    resumeBaseRef.current = { position: 0, duration: 0, startedAt: 0 };

    const movieId = movie.id ? String(movie.id) : null;
    let cancel = false;

    (async () => {
      if (!movieId || !user) return;
      const row = await fetchHistoryForMovie(user.id, activeViewerProfile?.id ?? null, movieId);
      if (cancel) return;
      const duration = Number(row?.duration_seconds) || 0;
      const position = Number(row?.position_seconds) || 0;
      const pct = duration > 0 ? (position / duration) * 100 : 0;
      if (position >= EMBED_START_MIN_SECONDS && pct < EMBED_RESUME_MAX_PCT) {
        setResumeSeconds(position);
        setShowResumeModal(true);
        setIsResuming(true);
        resumeBaseRef.current = { position, duration, startedAt: 0 };
      } else {
        setIsResuming(false);
        // Sem retomada: conta do zero a partir de agora.
        resumeBaseRef.current = { position: 0, duration, startedAt: Date.now() };
      }
    })();

    // Tick de 1s: só conta com a aba visível e salva a cada 20s.
    embedLastTickRef.current = Date.now();
    embedTimerRef.current = setInterval(() => {
      const base = resumeBaseRef.current;
      if (!base || base.startedAt <= 0 || document.hidden) return;
      const now = Date.now();
      if (now - embedLastTickRef.current >= SAVE_INTERVAL_MS) {
        embedLastTickRef.current = now;
        salvarProgressoEmbed();
      }
    }, 1000);

    return () => {
      cancel = true;
      pararContadorEmbed();
    };
  }, [currentUrl, sourceKind, movie, user, activeViewerProfile?.id, pararContadorEmbed, salvarProgressoEmbed]);

  // Salva uma última vez ao sair da página (fecha a aba / navega).
  useEffect(() => {
    if (!movie || !user) return;
    const salvar = () => salvarProgressoEmbed();
    window.addEventListener('pagehide', salvar);
    window.addEventListener('beforeunload', salvar);
    return () => {
      window.removeEventListener('pagehide', salvar);
      window.removeEventListener('beforeunload', salvar);
      salvar();
    };
  }, [movie, user, salvarProgressoEmbed]);

  // Reinicia o timeout quando a URL da fonte muda; se o iframe não confirmar
  // o carregamento a tempo, marcamos como esgotado para oferecer
  // "Abrir no navegador" em vez de deixar o usuário preso numa tela infinita.
  // Para YouTube o timeout é desativado (o iframe oficial não expõe eventos
  // confiáveis de load e um vídeo dublado pode demorar a iniciar).
  useEffect(() => {
    limparTimeout();
    setEsgotado(false);
    if (!currentUrl || sourceKind === 'youtube' || sourceKind === 'direct' || sourceKind === 'drive') return;
    timeoutRef.current = window.setTimeout(() => {
      setEsgotado(true);
    }, TIMEOUT_FONTE);
    return limparTimeout;
  }, [currentUrl, sourceKind, limparTimeout]);

  // ── Download ──────────────────────────────────────────────────────────────
  const podeBaixar = (entitlements.downloads ?? 0) > 0;
  const fonteDireta = sourceKind === 'direct' && Boolean(currentUrl);
  const jaBaixado = user && movie ? alreadyDownloaded(user.id, movie.id) : false;

  const handleDownloadClick = async () => {
    if (!user || !movie) return;
    if (!podeBaixar) {
      setDownloadState('blocked');
      return;
    }
    if (!fonteDireta) {
      setDownloadState('error');
      setDownloadError('Este título usa um player embutido (iframe) e não pode ser baixado diretamente. Escolha um título com fonte direta (MP4/HLS).');
      return;
    }
    if (jaBaixado) {
      setDownloadState('done');
      return;
    }
    setDownloadState('downloading');
    setDownloadProgress(0);
    setDownloadError(null);
    try {
      await downloadVideo({
        url: currentUrl!,
        title: movie.title,
        maxHeight: entitlements.maxHeight || 1080,
        onProgress: (p) => setDownloadProgress(p),
        onStarted: () => {},
      });
      registerDownload(user.id, movie.id);
      setDownloadState('done');
    } catch (err) {
      setDownloadState('error');
      setDownloadError(err instanceof Error ? err.message : 'Falha ao baixar o vídeo. Tente novamente.');
    }
  };

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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-black/80 backdrop-blur p-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 rounded-full bg-white/10 p-2.5 hover:bg-white/20 transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold flex-1">{movie?.title || 'Player'}</h1>
        {currentUrl && (
          <>
            {/* Botão de download — condicionado ao plano */}
            <button
              onClick={handleDownloadClick}
              disabled={downloadState === 'downloading'}
              title={
                !podeBaixar
                  ? 'Disponível nos planos Standard e Premium'
                  : !fonteDireta
                    ? 'Disponível apenas para fontes diretas (MP4/HLS)'
                    : 'Baixar este título'
              }
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition ${
                downloadState === 'done'
                  ? 'bg-emerald-600 text-white'
                  : podeBaixar && fonteDireta
                    ? 'bg-white/10 hover:bg-white/20'
                    : 'bg-white/5 text-zinc-400'
              }`}
            >
              {downloadState === 'downloading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {downloadProgress}%
                </>
              ) : downloadState === 'done' ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Baixado
                </>
              ) : !podeBaixar ? (
                <>
                  <Lock className="h-4 w-4" />
                  Baixar
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Baixar
                </>
              )}
            </button>
            <button
              onClick={() => window.open(currentUrl, '_blank', 'noopener,noreferrer')}
              title="Abrir o player em nova aba/navegador (útil se o app bloquear o iframe)"
              className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-2 text-xs font-medium hover:bg-red-500 transition"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir player
            </button>
          </>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col items-center justify-start min-h-screen px-4 sm:px-6 pt-24 pb-10 gap-6">
        {currentUrl ? (
          <div className="w-full max-w-5xl">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl shadow-red-900/20 ring-1 ring-white/10">
              {sourceKind === 'direct' ? (
                <video
                  key={currentUrl}
                  ref={videoRef}
                  controls
                  autoPlay
                  playsInline
                  onTimeUpdate={salvarProgresso}
                  onPause={salvarProgressoFinal}
                  onEnded={salvarProgressoFinal}
                  className="absolute inset-0 w-full h-full"
                  style={{ backgroundColor: '#000' }}
                />
              ) : (
                <iframe
                  key={currentUrl}
                  src={sourceKind === 'youtube' ? currentUrl : currentUrl}
                  title={`Player — ${movie?.title || ''}`}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                  referrerPolicy="origin"
                  // NOTA: o sandbox NÃO pode ser usado aqui — o vidlink.pro
                  // detecta iframes com atributo sandbox e recusa carregar
                  // ("Please Disable Sandbox"). O player é embutido sem
                  // sandbox para funcionar; a dublagem pt-BR vem do parâmetro
                  // selectedLanguage=portuguese na URL (src/lib/videoSources.ts).
                />
              )}
            </div>

            {/* Mensagens de download */}
            {downloadState === 'blocked' && (
              <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                <Lock className="h-6 w-6 text-amber-400" />
                <p className="text-sm text-amber-200">
                  Downloads offline estão disponíveis nos planos <strong>Standard</strong> e <strong>Premium</strong>.
                </p>
                <Link
                  to="/minha-assinatura"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400 transition"
                >
                  Ver planos
                </Link>
              </div>
            )}
            {downloadState === 'error' && downloadError && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <p className="text-sm text-red-200">{downloadError}</p>
              </div>
            )}
            {downloadState === 'done' && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                <p className="text-sm text-emerald-200">
                  Download concluído! O arquivo foi salvo no seu dispositivo.
                </p>
              </div>
            )}

            {esgotado ? (
              <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <p className="text-sm text-zinc-300">
                  O vídeo não carregou pela fonte principal.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => window.open(currentUrl, '_blank', 'noopener,noreferrer')}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold hover:bg-red-500 transition"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir no navegador
                  </button>
                  <button
                    onClick={reiniciarFonte}
                    className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20 transition"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Tentar novamente
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Se o app bloquear o player embutido, use "Abrir no navegador" — o vídeo abre no navegador externo do celular.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-center text-xs text-zinc-500">
                {currentUrl && (
                  <button onClick={reiniciarFonte} className="text-red-400 underline hover:text-red-300">
                    Recarregar player
                  </button>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-zinc-400 text-center mt-10">
            <Film className="h-20 w-20 text-zinc-700" />
            <p>Vídeo não disponível</p>
            <p className="text-sm">Nenhuma fonte de vídeo encontrada para este título.</p>
            <button onClick={() => navigate(-1)} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Voltar</button>
          </div>
        )}
      </div>

      {/* Modal: Quer continuar de onde parou? (players embed) */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
            <Clock className="mx-auto h-10 w-10 text-brand-400" />
            <h3 className="mt-3 text-lg font-bold text-white">Quer continuar de onde parou?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Você parou em <span className="text-white font-semibold">{formatarTempo(resumeSeconds)}</span>.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setShowResumeModal(false);
                  setIsResuming(false);
                  // "Não": zera o progresso salvo e começa do início.
                  if (movie && user) {
                    const mediaType = (movie.type === 'series' || movie.type === 'tv' || movie.type === 'anime' || movie.media_type === 'tv') ? 'tv' : 'movie';
                    upsertHistory.mutate({
                      movieId: movie.id,
                      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
                      mediaType,
                      title: movie.title,
                      posterPath: movie.poster_url,
                      backdropPath: movie.backdrop_url,
                      positionSeconds: 0,
                      durationSeconds: 0,
                    });
                  }
                  resumeBaseRef.current = { position: 0, duration: 0, startedAt: Date.now() };
                }}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Não
              </button>
              <button
                onClick={() => {
                  setShowResumeModal(false);
                  setIsResuming(false);
                  // "Sim": retoma da posição salva.
                  const base = resumeBaseRef.current;
                  resumeBaseRef.current = {
                    position: base ? base.position : resumeSeconds,
                    duration: base ? base.duration : 0,
                    startedAt: Date.now(),
                  };
                }}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-500 flex items-center justify-center gap-2"
              >
                <Play className="h-4 w-4" fill="white" />
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}