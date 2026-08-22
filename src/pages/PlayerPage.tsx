import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film, Loader2, Play } from 'lucide-react';

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);

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
        const tipo = 'tv';
        const idVal = series.imdb_id || series.tmdb_id;
        if (idVal) setWatchUrl(`https://vidsrc.cc/v2/embed/${tipo}/${idVal}?autoPlay=true`);
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
            const idVal = data.imdb_id || data.tmdb_id;
            if (idVal) setWatchUrl(`https://vidsrc.cc/v2/embed/tv/${idVal}?autoPlay=true`);
            setLoading(false);
            return;
          }
        }
      }

      setMovie(data);
      const tipo = (data.type === 'tv' || data.type === 'series' || data.type === 'anime' || data.media_type === 'tv') ? 'tv' : 'movie';
      const idVal = data.imdb_id || data.tmdb_id;
      if (idVal) setWatchUrl(`https://vidsrc.cc/v2/embed/${tipo}/${idVal}?autoPlay=true`);
      setLoading(false);
    }

    load();
  }, [id, searchParams]);

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
        <h1 className="truncate text-base font-semibold">{movie?.title || 'Player'}</h1>
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-20 pb-10 gap-6">
        {/* Poster */}
        {movie?.poster_url ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="w-48 rounded-xl shadow-2xl shadow-red-900/20"
          />
        ) : (
          <Film className="h-24 w-24 text-zinc-700" />
        )}

        {/* Título */}
        <h2 className="text-2xl font-bold text-center">{movie?.title}</h2>

        {/* Botão Assistir */}
        {watchUrl ? (
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl bg-red-600 px-10 py-4 text-xl font-bold hover:bg-red-700 transition shadow-lg shadow-red-900/30"
          >
            <Play className="h-7 w-7" /> Assistir agora
          </a>
        ) : (
          <div className="text-zinc-400 text-center">
            <p>Vídeo não disponível</p>
            <p className="text-sm mt-1">ID do IMDB/TMDB não cadastrado</p>
          </div>
        )}

        {/* Sinopse */}
        {movie?.description && (
          <p className="text-zinc-400 text-sm text-center max-w-md leading-relaxed mt-4">
            {movie.description}
          </p>
        )}
      </div>
    </div>
  );
}
