import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useMovies } from '@/hooks/useMovies';
import {
  getVideoSources,
  getTvSource,
  normalizeDubbedSource,
} from '@/lib/videoSources';
import { streamBetterMovieUrl, streamBetterSeriesUrl, primeiroEpisodioDisponivel } from '@/lib/strembetter';
import { ChevronLeft, ExternalLink, Film, Loader2, RefreshCw } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Player com DUBLAGEM pt-BR — fonte única: StreamBetter.
//
// Todos os títulos do catálogo são reproduzidos pelo player do StreamBetter
// embutido DENTRO do site Movieflix (<iframe src="https://streambetter.shop/
// filme/{tmdb_id}?lang=pt-BR">). O player resolve as fontes, legendas,
// fallbacks e seleciona automaticamente a faixa de áudio em português quando
// disponível (o bundle do player procura trilhas "pt"/"por"/"portug").
//
// Nenhum player de terceiros (vidlink.pro, megaembedapi, VidZee) é usado.
// ─────────────────────────────────────────────────────────────────────────────
const TIMEOUT_FONTE = 15000;

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const moviesQuery = useMovies();

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Única fonte de vídeo (fonte 1): embed do StreamBetter.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [esgotado, setEsgotado] = useState(false);
  const [sourceKind, setSourceKind] = useState<'youtube' | 'drive' | 'direct' | 'iframe' | null>(null);

  const timeoutRef = useRef<number | null>(null);

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
      const epId = epRaw ? parseInt(epRaw, 10) : null;

      // Séries (legado): quando um episode id chega via query, montamos o
      // embed de série do StreamBetter com temporada/episódio.
      if (epId && !isNaN(epId)) {
        const tituloId = Number(id);
        const season = Number(searchParams.get('season') || 1);
        const episode = Number(searchParams.get('ep') || epId);
        setMovie({ title: `Episódio ${episode}`, type: 'series', tmdb_id: tituloId });
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
          // Série: usa o primeiro episódio com fonte cadastrada
          // (episodes_available vem do gerador de catálogo).
          const ep = primeiroEpisodioDisponivel(found);
          if (ep) {
            setSourceUrl(streamBetterSeriesUrl(found.tmdb_id, ep.season, ep.episode));
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
          <button
            onClick={() => window.open(currentUrl, '_blank', 'noopener,noreferrer')}
            title="Abrir o player em nova aba/navegador (útil se o app bloquear o iframe)"
            className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-2 text-xs font-medium hover:bg-red-500 transition"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir player
          </button>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col items-center justify-start min-h-screen px-4 sm:px-6 pt-24 pb-10 gap-6">
        {currentUrl ? (
          <div className="w-full max-w-5xl">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl shadow-red-900/20 ring-1 ring-white/10">
              <iframe
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
                // sem sandbox para funcionar.
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
                <span>Sem anúncios no Movieflix — para 100% livre de anúncios, use o plano StreamBetter Creator</span>
                {currentUrl && (
                  <button onClick={reiniciarFonte} className="text-red-400 underline hover:text-red-300 ml-3">
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
    </div>
  );
}