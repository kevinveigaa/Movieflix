import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useMovies } from '@/hooks/useMovies';
import {
  normalizeDubbedSource,
} from '@/lib/videoSources';
import { streamBetterMovieUrl, streamBetterSeriesUrl, primeiroEpisodioDisponivel } from '@/lib/strembetter';
import { instalarBloqueioAnuncios, protegerIframeContraRedirect } from '@/lib/antiAds';
import { ehTelaDeTv } from '@/lib/tv';
import { temporadasDisponiveis, type EpisodioRef } from '@/lib/episodes';
import { useTvPlayerControls } from '@/hooks/useTvPlayerControls';
import { EpisodioSelector } from '@/components/series/EpisodioSelector';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePlaybackSession } from '@/hooks/usePlaybackSession';
import { downloadVideo } from '@/lib/hlsDownload';
import { downloadsUsed, registerDownload, alreadyDownloaded } from '@/lib/downloads';
import { ChevronLeft, ExternalLink, Film, Loader2, RefreshCw, Download, MonitorPlay, ShieldAlert } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════════════
// Player com DUBLAGEM pt-BR — fonte única: StreamBetter.
//
// Todos os títulos do catálogo são reproduzidos pelo player do StreamBetter
// embutido DENTRO do site Movieflix (<iframe src="https://streambetter.shop/
// filme/{tmdb_id}?lang=pt-BR">). O player resolve as fontes, legendas,
// fallbacks e seleciona automaticamente a faixa de áudio em português quando
// disponível (o bundle do player procura trilhas "pt"/"por"/"portug").
//
// Nenhum player de terceiros (vidlink.pro, megaembedapi, VidZee) é usado.
//
// Melhorias integradas:
//  - SÉRIES: seletor de temporada + episódio (EpisodioSelector) para escolher
//    qual episódio assistir; a URL ?season=&ep= atualiza a fonte do player.
//  - ANÚNCIOS: bloqueio de popups (window.open), links externos e guard de
//    redirect do iframe (restaura o player se um anúncio redirecionar).
//  - TV BOX / SMART TV: controles de reprodução por controle remoto
//    (OK/Play = play/pause, Voltar = sair do player) + navegação espacial
//    global do app (useTvNavigation) para o seletor de episódios e botões.
// ════════════════════════════════════════════════════════════════════════════════════
const TIMEOUT_FONTE = 15000;

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const moviesQuery = useMovies();

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Única fonte de vídeo (fonte 1): embed do StreamBetter.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [esgotado, setEsgotado] = useState(false);
  const [sourceKind, setSourceKind] = useState<'youtube' | 'drive' | 'direct' | 'iframe' | null>(null);

  // Estado de episódio selecionado (séries).
  const [epAtual, setEpAtual] = useState<EpisodioRef | null>(null);

  // Entitlements del plan del usuario (calidad, telas, descargas).
  const { entitlements } = useEntitlements();
  const { blocked: telasBloqueadas, activeScreens } = usePlaybackSession(
    user?.id,
    entitlements.screens,
    Boolean(user) && entitlements.screens > 0,
  );

  // Estado de descarga.
  const [descargando, setDescargando] = useState(false);
  const [descargaPct, setDescargaPct] = useState(0);
  const [descargaError, setDescargaError] = useState<string | null>(null);

  const puedeDescargar = entitlements.downloads > 0;
  const descargasUsadas = user ? downloadsUsed(user.id) : 0;
  const descargasIlimitadas = !Number.isFinite(entitlements.downloads);
  const yaDescargado = user && movie ? alreadyDownloaded(user.id, String(movie.id ?? movie.tmdb_id)) : false;

  async function iniciarDescarga() {
    if (!user || !movie || !currentUrl) return;
    if (!puedeDescargar) {
      setDescargaError('Tu plan no incluye descargas. Haz upgrade para descargar.');
      return;
    }
    if (!descargasIlimitadas && descargasUsadas >= entitlements.downloads) {
      setDescargaError('Alcanzaste el límite de descargas de tu plan este mes.');
      return;
    }
    setDescargando(true);
    setDescargaError(null);
    setDescargaPct(0);
    try {
      await downloadVideo({
        url: currentUrl,
        title: movie.title || 'Movieflix',
        maxHeight: entitlements.maxHeight,
        onProgress: (p) => setDescargaPct(p),
        onStarted: () => {
          if (user) registerDownload(user.id, String(movie.id ?? movie.tmdb_id));
        },
      });
    } catch (err) {
      setDescargaError((err as Error).message ?? 'No se pudo descargar el video.');
    } finally {
      setDescargando(false);
    }
  }

  const timeoutRef = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const currentUrl = sourceUrl;

  const limparTimeout = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const reiniciarFonte = () => {
    setEsgotado(false);
    limparTimeout();
    if (currentUrl) {
      setSourceUrl(null);
      requestAnimationFrame(() => setSourceUrl(currentUrl));
    }
  };

  // Monta a URL da fonte a partir do catálogo do StreamBetter (ou TMDB id).
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

      // Série com episódio explícito via query (?season=&ep=): monta o embed.
      if (epId && !isNaN(epId)) {
        const tituloId = Number(id);
        const season = seasonRaw ? Number(seasonRaw) : 1;
        const episode = epParam ? Number(epParam) : epId;
        setMovie({ title: `Episódio ${episode}`, type: 'series', tmdb_id: tituloId });
        setEpAtual({ season, episode });
        const src = streamBetterSeriesUrl(tituloId || null, season, episode);
        setSourceUrl(src || null);
        setLoading(false);
        return;
      }

      // Filme ou série: procura no catálogo (JSON estático gerado por
      // gerar-catalogo.cjs — filmes.json + series.json).
      const data = moviesQuery.data;
      const found = (data ?? []).find(
        (m: any) => String(m.id) === String(id) || String(m.tmdb_id) === String(id),
      );

      if (found) {
        setMovie(found);
        const ehSerie =
          String(found.type ?? '').toLowerCase() === 'series' ||
          String(found.type ?? '').toLowerCase() === 'tv';

        if (ehSerie) {
          // Série: respeita season/ep vindos da URL (navegação pelo seletor),
          // senão usa o primeiro episódio com fonte cadastrada.
          const seasonUrl = seasonRaw ? Number(seasonRaw) : null;
          const epUrl = epParam ? Number(epParam) : null;
          const episodio = (seasonUrl && epUrl && !isNaN(seasonUrl) && !isNaN(epUrl))
            ? { season: seasonUrl, episode: epUrl }
            : primeiroEpisodioDisponivel(found);

          if (episodio) {
            setEpAtual({ season: episodio.season, episode: episodio.episode });
            setSourceUrl(streamBetterSeriesUrl(found.tmdb_id, episodio.season, episodio.episode));
          } else {
            setErrorMsg('Nenhum episódio disponível para esta série no momento.');
          }
        } else {
          setSourceUrl(found.video_url || streamBetterMovieUrl(found.tmdb_id));
        }
        setLoading(false);
        return;
      }

      // Não está no catálogo local: tenta pelo TMDB id diretamente.
      const num = Number(id);
      if (Number.isFinite(num)) {
        setMovie({ title: `Título ${id}`, type: 'movie', tmdb_id: num });
        setSourceUrl(streamBetterMovieUrl(num));
        setLoading(false);
        return;
      }

      setErrorMsg('Título não encontrado.');
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, searchParams]);

  // Detecta o tipo de reprodução da fonte atual.
  useEffect(() => {
    const norm = currentUrl ? normalizeDubbedSource(currentUrl) : null;
    setSourceKind(norm ? norm.kind : 'iframe');
  }, [currentUrl]);

  // Reinicia o timeout quando a URL da fonte muda.
  useEffect(() => {
    limparTimeout();
    setEsgotado(false);
    if (!currentUrl || sourceKind !== 'iframe') return;
    timeoutRef.current = window.setTimeout(() => {
      setEsgotado(true);
    }, TIMEOUT_FONTE);
    return limparTimeout;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl, sourceKind]);

  // ─── Bloqueio de anúncios (anti-popup / anti-redirect) ───────────────────
  useEffect(() => {
    const limpar = instalarBloqueioAnuncios();
    return limpar;
  }, []);

  // Guard de redirect do iframe: restaura o player se um anúncio redirecionar
  // o documento do iframe para fora.
  useEffect(() => {
    if (!currentUrl || !iframeRef.current) return;
    const limpar = protegerIframeContraRedirect(iframeRef.current, currentUrl);
    return limpar;
  }, [currentUrl]);

  // ─── TV Box / Smart TV: controles de reprodução no player ────────────────
  const emTv = typeof window !== 'undefined' && ehTelaDeTv();
  const voltarDoPlayer = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }, [navigate]);
  useTvPlayerControls(Boolean(currentUrl) && emTv, voltarDoPlayer);

  // Troca de episódio (séries): atualiza a URL (?season=&ep=) e a fonte.
  const trocarEpisodio = useCallback(
    (ep: EpisodioRef) => {
      if (!movie) return;
      const params = new URLSearchParams(searchParams);
      params.set('season', String(ep.season));
      params.set('ep', String(ep.episode));
      params.delete('episode'); // formato legado não é mais necessário
      setSearchParams(params, { replace: true });
      setEpAtual(ep);
      const src = streamBetterSeriesUrl(movie.tmdb_id, ep.season, ep.episode);
      if (src) {
        setSourceUrl(null);
        requestAnimationFrame(() => setSourceUrl(src));
      }
    },
    [movie, searchParams, setSearchParams],
  );

  const ehSerieAtual =
    movie && (String(movie.type ?? '').toLowerCase() === 'series' || String(movie.type ?? '').toLowerCase() === 'tv');

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
        <button onClick={voltarDoPlayer} className="flex items-center gap-2 rounded-full bg-white/10 p-2.5 hover:bg-white/20 transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold flex-1">
          {movie?.title || 'Player'}
          {ehSerieAtual && epAtual ? (
            <span className="ml-2 text-xs font-medium text-zinc-400">
              T{epAtual.season} E{epAtual.episode}
            </span>
          ) : null}
        </h1>
        {currentUrl && (
          <button
            onClick={() => window.open(currentUrl, '_blank', 'noopener,noreferrer')}
            title="Abrir el player en nueva pestaña/navegador (útil si el app bloquea el iframe)"
            className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-2 text-xs font-medium hover:bg-red-500 transition"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir player
          </button>
        )}
        {currentUrl && puedeDescargar && (
          <button
            onClick={iniciarDescarga}
            disabled={descargando}
            title={descargasIlimitadas ? 'Descargas ilimitadas' : `${entitlements.downloads} descargas por mes`}
            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/20 transition disabled:opacity-50"
          >
            {descargando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {descargando ? `Descargando ${descargaPct}%` : 'Descargar'}
          </button>
        )}
      </div>

      {/* Aviso de límite de telas simultáneas */}
      {telasBloqueadas && (
        <div className="fixed top-20 left-0 right-0 z-50 flex items-center gap-3 bg-red-950/90 backdrop-blur px-4 py-3 text-sm text-white">
          <ShieldAlert className="h-5 w-5 text-red-400" />
          <span>
            Límite de {entitlements.screens} {entitlements.screens === 1 ? 'pantalla simultánea' : 'pantallas simultáneas'} alcanzado ({activeScreens} activas). Cierra la reproducción en otro dispositivo para continuar.
          </span>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex flex-col items-center justify-start min-h-screen px-4 sm:px-6 pt-24 pb-10 gap-6">
        {currentUrl ? (
          <div className="w-full max-w-5xl">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl shadow-red-900/20 ring-1 ring-white/10">
              <iframe
                ref={iframeRef}
                id="player-frame"
                key={currentUrl}
                src={currentUrl}
                title={`Player — ${movie?.title || ''}`}
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                referrerPolicy="origin"
                loading="eager"
                // NOTA: o sandbox NÃO pode ser usado — o StreamBetter detecta
                // iframes com atributo sandbox e recusa exibir o conteúdo
                // ("Não bloqueie os anúncios do player"). O player é embutido
                // sem sandbox para funcionar; o bloqueio de anúncios é feito
                // pela janela pai (ver lib/antiAds.ts).
              />
            </div>

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
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Áudio pt-BR preferido · Player StreamBetter
                </span>
                <span className="mx-2 text-zinc-600">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <MonitorPlay className="h-3.5 w-3.5 text-brand-400" />
                  Calidad {entitlements.qualityLabel}
                </span>
                <span className="mx-2 text-zinc-600">·</span>
                <span>Pop-ups e redirecionamentos de anúncios bloqueados automaticamente</span>
                {currentUrl && (
                  <button onClick={reiniciarFonte} className="text-red-400 underline hover:text-red-300 ml-3">
                    Recarregar player
                  </button>
                )}
              </p>
            )}

            {/* Série: seletor de temporada e episódio */}
            {ehSerieAtual && movie?.episodes_available && movie.episodes_available.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-300">
                  <Film className="h-4 w-4 text-brand-400" />
                  Episódios
                  <span className="ml-auto text-xs font-normal normal-case text-zinc-500">
                    {temporadasDisponiveis(movie.episodes_available).length} temporada(s) ·{' '}
                    {movie.episodes_available.length} episódio(s)
                  </span>
                </h2>
                <EpisodioSelector
                  episodes={movie.episodes_available}
                  current={epAtual}
                  onSelect={trocarEpisodio}
                />
              </div>
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
    </div>
  );
}