import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getVideoSources, getTvSource, normalizeDubbedSource } from '@/lib/videoSources';
import Hls from 'hls.js';
import { ChevronLeft, ExternalLink, Film, Loader2, RefreshCw } from 'lucide-react';

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
// ─────────────────────────────────────────────────────────────────────────────
const TIMEOUT_FONTE = 10000;
const YT_TIMEOUT_FONTE = 0; // desativado para YouTube

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
  // Tipo de reprodução da fonte atual.
  const [sourceKind, setSourceKind] = useState<'youtube' | 'drive' | 'direct' | 'iframe' | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
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

        // Fonte primária: `video_url` do banco (fontes comprovadamente dubladas
        // em pt-BR — YouTube "Filme Completo em Português", M3U, Drive). O
        // vidlink.pro fica como fallback: ele NÃO garante dublagem (a maioria
        // dos títulos vem em MP4 com áudio único em inglês — verificado).
        const vidlink = getTvSource(series.tmdb_id, season?.season_number || 1, ep.episode_number || 1);
        const lista = [ep.video_url, series.video_url, vidlink].filter(
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
            const vidlink = getTvSource(data.tmdb_id, seasons[0].season_number || 1, eps[0].episode_number || 1);
            const lista = [eps[0].video_url, data.video_url, vidlink].filter(
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
      // Fonte primária: `video_url` do banco (fontes comprovadamente dubladas
      // em pt-BR). O vidlink.pro (builtins) fica apenas como fallback — ele
      // não garante dublagem pt-BR (maioria dos títulos em MP4 com áudio EN).
      const lista = [data.video_url, ...builtins].filter((u): u is string => Boolean(u));
      setSourceUrl(lista.length > 0 ? lista[0] : null);
      setLoading(false);
    }

    load();
  }, [id, searchParams]);

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
              {sourceKind === 'direct' ? (
                <video
                  key={currentUrl}
                  ref={videoRef}
                  controls
                  autoPlay
                  playsInline
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