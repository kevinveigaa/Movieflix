import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getVideoSources, getTvSource } from '@/lib/videoSources';
import { ChevronLeft, ExternalLink, Film, Loader2, RefreshCw } from 'lucide-react';

// O player usa UMA única fonte (fonte 1 — VidZee), validada como a que
// funciona. Não há mais cascata de fallback: se a fonte não carregar,
// oferecemos "Abrir no navegador" / "Tentar novamente".
const TIMEOUT_FONTE = 10000;

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Única fonte de vídeo (fonte 1).
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  // True quando o timeout expirou (a fonte não carregou de verdade).
  const [esgotado, setEsgotado] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<number | null>(null);

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

  // Monta a URL da fonte 1 a partir do banco + IDs (filme ou episódio/série).
  useEffect(() => {
    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }

      const epRaw = searchParams.get('episode');
      const epId = epRaw ? parseInt(epRaw, 10) : null;

      if (epId && !isNaN(epId)) {
        const { data: ep } = await supabase.from('episodes').select('*').eq('id', epId).maybeSingle();
        if (!ep) {
          setErrorMsg('Episódio não encontrado.');
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
        setMovie({ ...series, title: `${series.title} — T${season?.season_number || '?'} E${ep.episode_number}: ${ep.title}` });

        // Fonte de verdade: video_url cadastrado no banco (episódio/série);
        // senão, VidZee (fonte 1) com temporada/episódio reais.
        const vidzee = getTvSource(series.tmdb_id, season?.season_number || 1, ep.episode_number || 1);
        const lista = [ep.video_url, series.video_url, vidzee].filter(
          (u): u is string => Boolean(u),
        );
        setSourceUrl(lista.length > 0 ? lista[0] : null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from('movies').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        setErrorMsg(error?.message || 'Título não encontrado.');
        setLoading(false);
        return;
      }

      const isSeries = data.type === 'series' || data.type === 'tv' || data.type === 'anime' || data.media_type === 'tv' || (data.number_of_seasons > 0);
      if (isSeries && !data.video_url) {
        const { data: seasons } = await supabase.from('seasons').select('*').eq('series_id', data.id).order('season_number', { ascending: true });
        if (seasons && seasons.length > 0) {
          const { data: eps } = await supabase.from('episodes').select('*').eq('season_id', seasons[0].id).not('video_url', 'is', null).order('episode_number', { ascending: true }).limit(1);
          if (eps && eps.length > 0) {
            setMovie({ ...data, title: `${data.title} — T${seasons[0].season_number} E${eps[0].episode_number}: ${eps[0].title}` });
            const vidzee = getTvSource(data.tmdb_id, seasons[0].season_number || 1, eps[0].episode_number || 1);
            const lista = [eps[0].video_url, data.video_url, vidzee].filter(
              (u): u is string => Boolean(u),
            );
            setSourceUrl(lista.length > 0 ? lista[0] : null);
            setLoading(false);
            return;
          }
        }
      }

      setMovie(data);
      const tipo = (data.type === 'tv' || data.type === 'series' || data.type === 'anime' || data.media_type === 'tv') ? 'tv' : 'movie';
      const builtins = getVideoSources({
        imdbId: data.imdb_id,
        tmdbId: data.tmdb_id,
        mediaType: tipo,
      });
      const lista = [data.video_url, ...builtins].filter((u): u is string => Boolean(u));
      setSourceUrl(lista.length > 0 ? lista[0] : null);
      setLoading(false);
    }

    load();
  }, [id, searchParams]);

  // Reinicia o timeout quando a URL da fonte muda; se o iframe não confirmar
  // o carregamento a tempo, marcamos como esgotado para oferecer
  // "Abrir no navegador" em vez de deixar o usuário preso numa tela infinita.
  useEffect(() => {
    limparTimeout();
    setEsgotado(false);
    if (!currentUrl) return;
    timeoutRef.current = window.setTimeout(() => {
      setEsgotado(true);
    }, TIMEOUT_FONTE);
    return limparTimeout;
  }, [currentUrl, limparTimeout]);

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
        {/* Player em iframe — ocupa a área principal */}
        {currentUrl ? (
          <div className="w-full max-w-5xl">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl shadow-red-900/20 ring-1 ring-white/10">
              <iframe
                key={currentUrl}
                ref={iframeRef}
                src={currentUrl}
                title={`Player — ${movie?.title || ''}`}
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                referrerPolicy="origin"
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
    </div>
  );
}
