import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film, Loader2, Play } from 'lucide-react';
import { getVidsrcUrl } from '@/lib/videoSources';

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }

      const epRaw = searchParams.get('episode');
      const epId = epRaw ? parseInt(epRaw, 10) : null;

      if (epId && !isNaN(epId)) {
        const { data: ep } = await supabase.from('episodes').select('*').eq('id', epId).maybeSingle();
        if (!ep) { setErrorMsg('Episódio não encontrado.'); setLoading(false); return; }
        const { data: season } = await supabase.from('seasons').select('*').eq('id', ep.season_id).maybeSingle();
        const { data: series } = await supabase.from('movies').select('*').eq('id', season?.series_id || id).maybeSingle();
        if (!series) { setErrorMsg('Série não encontrada.'); setLoading(false); return; }
        setMovie({ ...series, title: `${series.title} — T${season?.season_number || '?'} E${ep.episode_number}: ${ep.title}` });
        const vidsrc = getVidsrcUrl({ imdbId: series.imdb_id, tmdbId: series.tmdb_id, mediaType: 'tv' });
        if (vidsrc) setProxyUrl(`/api/player?url=${encodeURIComponent(vidsrc)}`);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from('movies').select('*').eq('id', id).maybeSingle();
      if (error || !data) { setErrorMsg(error?.message || 'Título não encontrado.'); setLoading(false); return; }

      const isSeries = data.type === 'series' || data.type === 'tv' || data.type === 'anime' || data.media_type === 'tv' || (data.number_of_seasons > 0);
      if (isSeries && !data.video_url) {
        const { data: seasons } = await supabase.from('seasons').select('*').eq('series_id', data.id).order('season_number', { ascending: true });
        if (seasons && seasons.length > 0) {
          const { data: eps } = await supabase.from('episodes').select('*').eq('season_id', seasons[0].id).not('video_url', 'is', null).order('episode_number', { ascending: true }).limit(1);
          if (eps && eps.length > 0) {
            setMovie({ ...data, title: `${data.title} — T${seasons[0].season_number} E${eps[0].episode_number}: ${eps[0].title}` });
            const vidsrc = getVidsrcUrl({ imdbId: data.imdb_id, tmdbId: data.tmdb_id, mediaType: 'tv' });
            if (vidsrc) setProxyUrl(`/api/player?url=${encodeURIComponent(vidsrc)}`);
            setLoading(false);
            return;
          }
        }
      }

      setMovie(data);
      const vidsrc = getVidsrcUrl({ imdbId: data.imdb_id, tmdbId: data.tmdb_id, mediaType: data.type || data.media_type });
      if (vidsrc) setProxyUrl(`/api/player?url=${encodeURIComponent(vidsrc)}`);
      setLoading(false);
    }

    load();
  }, [id, searchParams]);

  // Se iframe não carregar em 5s, mostra botão
  useEffect(() => {
    if (!proxyUrl) return;
    const timer = setTimeout(() => setShowButton(true), 5000);
    return () => clearTimeout(timer);
  }, [proxyUrl]);

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
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold">{movie?.title || 'Player'}</h1>
      </div>

      <div className="relative w-full bg-black pt-14">
        {proxyUrl ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            {/* IFRAME via proxy interno (mesmo domínio = sem bloqueio) */}
            {!showButton && (
              <>
                <iframe
                  src={proxyUrl}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                  loading="eager"
                  title={movie?.title || 'Vídeo'}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black pointer-events-none">
                  <Loader2 className="h-10 w-10 animate-spin text-red-600" />
                  <p className="text-sm text-zinc-300">Carregando player...</p>
                </div>
              </>
            )}

            {/* Botão Assistir — abre proxy em nova aba (mesmo domínio) */}
            {showButton && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-zinc-950 px-6 text-center">
                <Play className="h-16 w-16 text-red-600" />
                <h3 className="text-xl font-bold">{movie?.title}</h3>
                <p className="text-sm text-zinc-400 max-w-sm">
                  Toque no botão abaixo para iniciar a reprodução.
                </p>
                <a
                  href={proxyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl bg-red-600 px-8 py-4 text-lg font-bold hover:bg-red-700 transition"
                >
                  <Play className="h-6 w-6" /> Assistir agora
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4 px-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Vídeo não disponível</h2>
            <p className="text-zinc-400 text-sm max-w-md">
              Este título não possui ID do IMDB ou TMDB cadastrado.
            </p>
            <button onClick={() => navigate(-1)} className="rounded-xl bg-red-600 px-6 py-2 font-semibold text-sm">Voltar</button>
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
