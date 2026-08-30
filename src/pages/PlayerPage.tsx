import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { streamBetterMovieUrl, streamBetterSeriesUrl, ehEmbedVidCore } from '@/lib/strembetter';
import { SubscriptionPaywall } from '@/components/player/SubscriptionPaywall';
import { hasActiveSubscription } from '@/context/AuthContext';
import { protegerIframeContraRedirect } from '@/lib/antiAds';
import { useUpsertHistory, fetchHistoryForMovie } from '@/hooks/useWatchHistory';
import { useMovies } from '@/hooks/useMovies';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useTvPlayerControls } from '@/hooks/useTvPlayerControls';
import { usePlaybackSession } from '@/hooks/usePlaybackSession';
import { ehTelaDeTv } from '@/lib/tv';
import {
  temProgressoReal,
  ehProgressoLixo,
  rotuloPontoParada,
} from '@/lib/watchProgress';
import { ChevronLeft, Film, Gamepad2, Loader2, RotateCcw, Play, Clock, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Player do Movieflix — CINESRC (https://cinesrc.st)
//
// O player principal é o CineSrc, um serviço de embed de filmes e séries
// baseado em TMDB ID. O embed é gerado AUTOMATICAMENTE a partir do tmdb_id
// (filme) ou tmdb_id + temporada + episódio (série) — sem URLs manuais por
// título. O CineSrc resolve fontes, legendas, áudio e qualidade do outro lado,
// num player self-contained (play, seek, volume, fullscreen, PiP e cast), sem
// overlay "Abrir link", sem redirecionamento externo e sem anúncios próprios
// do Movieflix.
//
//   Filmes : https://cinesrc.st/embed/movie/{tmdbId}
//   Séries : https://cinesrc.st/embed/tv/{tmdbId}?s={temporada}&e={episodio}
//
// O embed é renderizado DENTRO do site/app via <iframe> (allowFullScreen,
// responsivo). O Movieflix não injeta anúncios e não redireciona o usuário
// para fora — a proteção anti-redirect (antiAds) restaura a URL do player se
// um anúncio tentar mudar o documento do iframe.
//
// PROGRESSO ("Continuar assistindo"):
//   - O prompt de retomada SÓ aparece para títulos com progresso REAL
//     (posição salva >= 10 min ou >= 30% da duração).
//   - A posição é estimada (posição base + tempo decorrido com a aba visível)
//     e salva a cada 20s no histórico.
// ─────────────────────────────────────────────────────────────────────────────
const SAVE_INTERVAL_MS = 20000;

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, activeViewerProfile, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const upsertHistory = useUpsertHistory();
  const mutateHistory = upsertHistory.mutate;
  const { entitlements } = useEntitlements();
  const movies = useMovies();
  const { blocked: telasBloqueadas, activeScreens } = usePlaybackSession(user?.id, entitlements.screens, Boolean(user) && entitlements.screens > 0);

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [epAtual, setEpAtual] = useState<{ season: number; episode: number } | null>(null);

  // URL do embed do CineSrc (fonte única).
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const playerFrameRef = useRef<HTMLIFrameElement>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);

  // Modal "Quer continuar de onde parou?" — mostrado ao reabrir um título que
  // JÁ TEM progresso real salvo (>= 10 min ou >= 30%).
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [resumeSeason, setResumeSeason] = useState<number | null>(null);
  const [resumeEpisode, setResumeEpisode] = useState<number | null>(null);
  const [isResuming, setIsResuming] = useState(true);

  // Modo "CONTROLE DO PLAYER" (TV / TV Box): ativado/desativado segurando OK.
  const [modoPlayerAtivo, setModoPlayerAtivo] = useState(false);

  const currentUrl = sourceUrl;

  // Controle por controle remoto (TV / TV Box).
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

  // Guarda de redirect do iframe (antiAds): se um anúncio redirecionar o
  // DOCUMENTO do iframe para fora do player, restaura a URL original
  // automaticamente e em silêncio. O CineSrc é um player self-contained —
  // não navega legitimamente para fora.
  useEffect(() => {
    if (!currentUrl || !ehEmbedVidCore(currentUrl)) return;
    const iframe = playerFrameRef.current;
    if (!iframe) return;
    iframe.setAttribute('data-player-src', currentUrl);
    const limpar = protegerIframeContraRedirect(iframe, currentUrl);
    return limpar;
  }, [currentUrl]);

  // Monta a URL do embed do CineSrc a partir do banco + IDs (filme ou episódio/série).
  useEffect(() => {
    async function load() {
      try {
        if (!id) {
          setLoading(false);
          return;
        }

        // Aceita `episode` (URL canônica) OU `ep` (usado por CatalogPage,
        // HomePage, TitleDetailPage e EpisodioSelector ao navegar para
        // /assistir/{id}?season=X&ep=Y).
        const epRaw = searchParams.get('episode') ?? searchParams.get('ep');
        const seasonRaw = searchParams.get('season');
        const epParam = searchParams.get('ep');
        const epId = epRaw ? parseInt(epRaw, 10) : null;
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
        // catálogo (a fonte de verdade do front).

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
              const vidlink = streamBetterSeriesUrl(dataResolved.tmdb_id, seasons[0].season_number || 1, eps[0].episode_number || 1, startSeconds);
              // CineSrc (embed do tmdb_id) é a fonte PRIMÁRIA; video_url do banco
              // (StreamBetter) fica apenas como fallback.
              const lista = [vidlink, eps[0].video_url, dataResolved.video_url].filter(
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
        // Fonte primária: embed do CineSrc montado a partir do tmdb_id (filme).
        // `video_url` do banco (StreamBetter) fica apenas como fallback.
        const embedUrl = dataResolved.tmdb_id
          ? (tipo === 'tv'
              ? streamBetterSeriesUrl(dataResolved.tmdb_id, 1, 1, startSeconds)
              : streamBetterMovieUrl(dataResolved.tmdb_id, startSeconds))
          : null;
        const lista = [embedUrl, dataResolved.video_url].filter((u): u is string => Boolean(u));
        setSourceUrl(lista.length > 0 ? lista[0] : null);
        setLoading(false);
      } catch (erro) {
        console.error('[PlayerPage] falha ao carregar fonte:', erro);
        setErrorMsg('Não foi possível carregar este título. Verifique sua conexão e tente novamente.');
        setLoading(false);
      }
    }

    load();
  }, [id, searchParams, movies.data]);

  // ---- Salvar progresso (player embed cross-origin) ----
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

  const pararContadorEmbed = useCallback(() => {
    if (embedTimerRef.current !== null) {
      clearInterval(embedTimerRef.current);
      embedTimerRef.current = null;
    }
  }, []);

  const resumeBaseRef = useRef<{ position: number; duration: number; startedAt: number } | null>(null);
  const embedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const embedLastTickRef = useRef(0);

  // Players embed (iframe cross-origin — CineSrc): busca o progresso salvo e
  // oferece retomada quando há progresso REAL.
  useEffect(() => {
    if (!currentUrl || !movie || !user) return;
    pararContadorEmbed();
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
          resumeBaseRef.current = { position: 0, duration, startedAt: Date.now() };
        }
      } catch (erro) {
        if (cancel) return;
        console.error('[PlayerPage] falha ao buscar histórico de retomada:', erro);
        setIsResuming(false);
        resumeBaseRef.current = { position: 0, duration: 0, startedAt: Date.now() };
      }
    })();

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
  }, [currentUrl, movie, user, activeViewerProfile?.id, pararContadorEmbed, salvarProgressoEmbed]);

  // Salva uma última vez ao sair da página.
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

  if (loading || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
      </div>
    );
  }

  // GUARDA DE ROTA: a rota /assistir/:id RE-VERIFICA auth + assinatura ANTES
  // de montar qualquer player/iframe.
  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <Film className="h-16 w-16 text-red-600" />
        <h2 className="text-2xl font-bold">Login necessário</h2>
        <button onClick={() => navigate('/login')} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Entrar</button>
      </div>
    );
  }

  // BLOQUEIO DE ASSINATURA: sem NENHUM dos planos ativos, não há reprodução.
  if (!assinante) {
    return <SubscriptionPaywall />;
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
              <iframe
                key={currentUrl}
                ref={playerFrameRef}
                id="player-frame"
                src={currentUrl}
                data-player-src={currentUrl}
                title={`Player — ${movie?.title || ''}`}
                className="tv-player absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                referrerPolicy="origin"
                data-tv-focusable
              />
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

            {/* Dica de controle remoto */}
            <p className="mt-2 text-center text-[11px] text-zinc-500 sm:text-xs">
              🎮 Controle remoto:{' '}
              <span className="font-semibold text-red-400">segure OK</span> para
              entrar nos controles do player e{' '}
              <span className="font-semibold text-red-400">segure OK novamente</span>{' '}
              para sair.
            </p>

            <p className="mt-2 text-center text-xs text-zinc-500">
              <button onClick={() => { setSourceUrl(null); requestAnimationFrame(() => setSourceUrl(currentUrl)); }} className="text-red-400 underline hover:text-red-300">
                Recarregar player
              </button>
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-zinc-400 text-center mt-10">
            <AlertTriangle className="h-20 w-20 text-zinc-700" />
            <p>Vídeo não disponível</p>
            <p className="text-sm">Nenhuma fonte de vídeo encontrada para este título.</p>
            <button onClick={() => navigate(-1)} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Voltar</button>
          </div>
        )}
      </div>

      {/* Modal: Quer continuar de onde parou? */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
            <Clock className="mx-auto h-10 w-10 text-roxo-400" />
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
                  const base = resumeBaseRef.current;
                  const pos = base ? base.position : resumeSeconds;
                  resumeBaseRef.current = {
                    position: pos,
                    duration: base ? base.duration : 0,
                    startedAt: Date.now(),
                  };
                  // Garante retomada exata: se a URL atual não tem ?t=, remonta.
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