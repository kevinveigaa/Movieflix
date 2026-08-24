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
import { useTvPlayerControls } from '@/hooks/useTvPlayerControls';
import { ehTelaDeTv } from '@/lib/tv';
import {
  temProgressoReal,
  ehProgressoLixo,
  formatarTempoRelogio,
  rotuloPontoParada,
} from '@/lib/watchProgress';
import Hls from 'hls.js';
import { ChevronLeft, Film, Gamepad2, Loader2, RefreshCw, AlertCircle, RotateCcw, Play, Clock } from 'lucide-react';

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
// PROGRESSO ("Continuar assistindo") — regra nova:
//   - O prompt de retomada SÓ aparece para títulos com progresso REAL:
//     posição salva >= 10 minutos (ou >= 30% da duração, p/ títulos curtos).
//   - A posição é salva a cada 20 s durante a reprodução (nunca no load).
//   - Ao reabrir, "Sim" retoma do segundo exato via ?t=segundos na URL do
//     embed do StreamBetter (que aceita o parâmetro `t`).
//   - Séries: salva temporada/episódio e mostra "T1 · E3" no modal.
// ─────────────────────────────────────────────────────────────────────────────
const TIMEOUT_FONTE = 10000;
const YT_TIMEOUT_FONTE = 0; // desativado para YouTube
const SAVE_INTERVAL_MS = 20000; // salva progresso a cada 20s

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, activeViewerProfile } = useAuth();
  const upsertHistory = useUpsertHistory();
  // A identidade de `upsertHistory.mutate` é estável entre renders (TanStack
  // Query v5 mantém a função mutate memoizada). Guardamos a função direto para
  // que nenhum useCallback/useEffect dependa do objeto do hook (recriado a
  // cada render) — isso evita loop infinito de renders (React #185).
  const mutateHistory = upsertHistory.mutate;
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastSavedRef = useRef(0);
  const embedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const embedLastTickRef = useRef(0);

  // Modal "Quer continuar de onde parou?" — mostrado ao reabrir um título que
  // JÁ TEM progresso real salvo (>= 10 min ou >= 30%). "Sim" retoma da posição
  // salva (?t=segundos na URL do embed); "Não" zera o progresso e começa do início.
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [resumeSeason, setResumeSeason] = useState<number | null>(null);
  const [resumeEpisode, setResumeEpisode] = useState<number | null>(null);
  const [isResuming, setIsResuming] = useState(true);

  // Modo "CONTROLE DO PLAYER" (TV / TV Box): ativado/desativado segurando OK
  // ~1s. Quando ativo, as setas do controle operam os controles internos do
  // player; um toque rápido de OK mantém o comportamento normal do vídeo.
  const [modoPlayerAtivo, setModoPlayerAtivo] = useState(false);

  const currentUrl = sourceUrl;

  // Controle por controle remoto (TV / TV Box): segurar OK ~1s alterna o modo
  // "controle do player" (setas = controles internos do vídeo); toque rápido de
  // OK = ação normal; Voltar = sair da página.
  const playerFrameRef = useRef<HTMLIFrameElement>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  useTvPlayerControls(
    Boolean(currentUrl) && ehTelaDeTv(),
    modoPlayerAtivo,
    playerFrameRef,
    () => navigate(-1),
  );

  // Sincroniza o badge "CONTROLE DO PLAYER" com o modo alternado por long-press.
  useEffect(() => {
    function onModeChange() {
      setModoPlayerAtivo(document.documentElement.classList.contains('tv-in-player'));
    }
    onModeChange();
    window.addEventListener('mf-player-mode-change', onModeChange);
    return () => window.removeEventListener('mf-player-mode-change', onModeChange);
  }, []);

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
      try {
        if (!id) {
          setLoading(false);
          return;
        }

        // Aceita `episode` (URL canônica) OU `ep` (usado por CatalogPage,
        // HomePage, TitleDetailPage e EpisodioSelector ao navegar para
        // /assistir/{id}?season=X&ep=Y). Sem isso, séries nunca reproduziam
        // (o player caía no fluxo de filme e mostrava "Título não encontrado").
        const epRaw = searchParams.get('episode') ?? searchParams.get('ep');
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
          setMovie({ title: `Episódio ${episode}`, type: 'series', tmdb_id: tituloId, season_number: season, episode_number: episode });
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
              setMovie({ ...dataResolved, title: `${dataResolved.title} — T${seasons[0].season_number} E${eps[0].episode_number}: ${eps[0].title}`, season_number: seasons[0].season_number, episode_number: eps[0].episode_number });
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
      } catch (erro) {
        // Falha de rede/Supabase ao montar a fonte: nunca derruba a página —
        // mostra a tela de erro do player em vez do ErrorBoundary.
        console.error('[PlayerPage] falha ao carregar fonte:', erro);
        setErrorMsg('Não foi possível carregar este título. Verifique sua conexão e tente novamente.');
        setLoading(false);
      }
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

  // ---- Salvar progresso ----

  // Grava o progresso do player nativo (MP4/HLS direto).
  const salvarProgresso = useCallback(() => {
    const video = videoRef.current;
    if (!video || !movie || !user) return;
    const now = Date.now();
    if (now - lastSavedRef.current < SAVE_INTERVAL_MS) return;
    lastSavedRef.current = now;
    const mediaType = (movie.type === 'series' || movie.type === 'tv' || movie.type === 'anime' || movie.media_type === 'tv') ? 'tv' : 'movie';
    mutateHistory({
      movieId: movie.id,
      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
      mediaType,
      title: movie.title,
      posterPath: movie.poster_url,
      backdropPath: movie.backdrop_url,
      positionSeconds: Math.floor(video.currentTime || 0),
      durationSeconds: Math.floor(video.duration || 0),
      season: movie.season_number ?? epAtual?.season ?? null,
      episode: movie.episode_number ?? epAtual?.episode ?? null,
    });
  }, [movie, user, mutateHistory, epAtual]);

  const salvarProgressoFinal = useCallback(() => {
    const video = videoRef.current;
    if (!video || !movie || !user) return;
    const mediaType = (movie.type === 'series' || movie.type === 'tv' || movie.type === 'anime' || movie.media_type === 'tv') ? 'tv' : 'movie';
    mutateHistory({
      movieId: movie.id,
      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
      mediaType,
      title: movie.title,
      posterPath: movie.poster_url,
      backdropPath: movie.backdrop_url,
      positionSeconds: Math.floor(video.currentTime || 0),
      durationSeconds: Math.floor(video.duration || 0),
      season: movie.season_number ?? epAtual?.season ?? null,
      episode: movie.episode_number ?? epAtual?.episode ?? null,
    });
  }, [movie, user, mutateHistory, epAtual]);

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
    mutateHistory({
      movieId: movie.id,
      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
      mediaType,
      title: movie.title,
      posterPath: movie.poster_url,
      backdropPath: movie.backdrop_url,
      positionSeconds: position,
      durationSeconds: duration,
      season: movie.season_number ?? epAtual?.season ?? null,
      episode: movie.episode_number ?? epAtual?.episode ?? null,
    });
  }, [movie, user, mutateHistory, epAtual]);

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
  //  - Se houver progresso REAL (>= 10 min ou >= 30% da duração), abre o modal
  //    "Quer continuar de onde parou?" — "Sim" inicia o contador na posição
  //    salva; "Não" zera o progresso e começa do início;
  //  - NUNCA mostra o modal para títulos sem progresso real (não assistidos
  //    ou com menos de 10 minutos);
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
      try {
        if (!movieId || !user) return;
        const row = await fetchHistoryForMovie(user.id, activeViewerProfile?.id ?? null, movieId);
        if (cancel) return;
        const duration = Number(row?.duration_seconds) || 0;
        const position = Number(row?.position_seconds) || 0;
        // REGRA NOVA: só oferece retomada para progresso REAL (>= 10 min ou
        // >= 30% da duração). Progresso "lixo" (posição 0 / duração 0 de
        // gravações antigas) e títulos sem nunca ter sido assistidos NUNCA
        // mostram o modal.
        const temProgresso = !ehProgressoLixo(position, duration) && temProgressoReal(position, duration);
        if (temProgresso) {
          setResumeSeconds(position);
          setResumeSeason(row?.season_number ?? null);
          setResumeEpisode(row?.episode_number ?? null);
          setShowResumeModal(true);
          setIsResuming(true);
          resumeBaseRef.current = { position, duration, startedAt: 0 };
        } else {
          setIsResuming(false);
          // Sem retomada: conta do zero a partir de agora.
          resumeBaseRef.current = { position: 0, duration, startedAt: Date.now() };
        }
      } catch (erro) {
        // Falha ao consultar o histórico (rede/RLS): segue sem modal de
        // retomada e conta do zero — nunca derruba o player.
        if (cancel) return;
        console.error('[PlayerPage] falha ao buscar histórico de retomada:', erro);
        setIsResuming(false);
        resumeBaseRef.current = { position: 0, duration: 0, startedAt: Date.now() };
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

  // ── Download / player externo removidos ─────────────────────────────────
  // O conteúdo é reproduzido APENAS dentro do MovieFlix (player embutido),
  // conforme pedido: não há mais "Baixar" nem "Abrir player externo".

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
        <button onClick={() => navigate(-1)} data-tv-focusable className="flex items-center gap-2 rounded-full bg-white/10 p-2.5 hover:bg-white/20 transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold flex-1">{movie?.title || 'Player'}</h1>
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col items-center justify-start min-h-screen px-4 sm:px-6 pt-24 pb-10 gap-6">
        {currentUrl ? (
          <div className="w-full max-w-5xl">
            <div
              ref={playerBoxRef}
              data-tv-player-box
              className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl shadow-red-900/20 ring-1 ring-white/10"
            >
              {sourceKind === 'direct' ? (
                <video
                  key={currentUrl}
                  ref={videoRef}
                  controls
                  autoPlay
                  playsInline
                  data-mf-player
                  data-tv-focusable
                  data-tv-player-box
                  onTimeUpdate={salvarProgresso}
                  onPause={salvarProgressoFinal}
                  onEnded={salvarProgressoFinal}
                  className="absolute inset-0 w-full h-full"
                  style={{ backgroundColor: '#000' }}
                />
              ) : (
                <iframe
                  key={currentUrl}
                  ref={playerFrameRef}
                  id="player-frame"
                  src={currentUrl}
                  title={`Player — ${movie?.title || ''}`}
                  className="tv-player absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                  referrerPolicy="origin"
                  data-tv-focusable
                  // NOTA: o sandbox NÃO pode ser usado aqui — o vidlink.pro
                  // detecta iframes com atributo sandbox e recusa carregar
                  // ("Please Disable Sandbox"). O player é embutido sem
                  // sandbox para funcionar; a dublagem pt-BR vem do parâmetro
                  // lang=pt-BR na URL (src/lib/strembetter.ts).
                />
              )}
            </div>

            {/* Indicador de modo controle do player (TV / TV Box) */}
            {modoPlayerAtivo && (
              <div
                data-tv-player-mode
                className="pointer-events-none mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-red-500/50 bg-red-600/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-red-300 backdrop-blur"
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                CONTROLE DO PLAYER
              </div>
            )}

            {/* Dica de controle remoto: como entrar/sair dos controles do player */}
            <p className="mt-2 text-center text-[11px] text-zinc-500 sm:text-xs">
              🎮 Controle remoto:{' '}
              <span className="font-semibold text-red-400">segure OK</span> para
              entrar nos controles do player e{' '}
              <span className="font-semibold text-red-400">segure OK novamente</span>{' '}
              para sair.
            </p>

            {/* Mensagens de download (removidas) */}

            {esgotado ? (
              <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <p className="text-sm text-zinc-300">
                  O vídeo não carregou pela fonte principal.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={reiniciarFonte}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold hover:bg-red-500 transition"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Tentar novamente
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  O conteúdo é reproduzido dentro do MovieFlix. Se não carregar,
                  tente novamente em alguns instantes.
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
              Você parou em{' '}
              <span className="text-white font-semibold">
                {rotuloPontoParada({ position: resumeSeconds, duration: 0, season: resumeSeason, episode: resumeEpisode })}
              </span>
              .
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setShowResumeModal(false);
                  setIsResuming(false);
                  // "Não": zera o progresso salvo e começa do início.
                  if (movie && user) {
                    const mediaType = (movie.type === 'series' || movie.type === 'tv' || movie.type === 'anime' || movie.media_type === 'tv') ? 'tv' : 'movie';
                    mutateHistory({
                      movieId: movie.id,
                      tmdbId: Number(movie.tmdb_id ?? 0) || undefined,
                      mediaType,
                      title: movie.title,
                      posterPath: movie.poster_url,
                      backdropPath: movie.backdrop_url,
                      positionSeconds: 0,
                      durationSeconds: 0,
                      season: null,
                      episode: null,
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
                  // "Sim": retoma da posição salva. A URL do embed já foi
                  // montada com ?t=segundos (streamBetterMovieUrl/SeriesUrl
                  // recebem startSeconds do query param ?t=). Para o caso de
                  // o embed já estar carregado sem ?t=, recarregamos com o
                  // tempo salvo.
                  const base = resumeBaseRef.current;
                  const pos = base ? base.position : resumeSeconds;
                  resumeBaseRef.current = {
                    position: pos,
                    duration: base ? base.duration : 0,
                    startedAt: Date.now(),
                  };
                  // Garante retomada exata: se a URL atual não tem ?t=,
                  // remonta com o tempo salvo.
                  if (currentUrl && !currentUrl.includes('t=')) {
                    const sep = currentUrl.includes('?') ? '&' : '?';
                    setSourceUrl(`${currentUrl}${sep}t=${Math.floor(pos)}`);
                  }
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
