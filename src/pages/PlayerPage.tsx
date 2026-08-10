import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Film } from 'lucide-react';

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }
      const { data } = await supabase.from('movies').select('*').eq('id', id).single();
      setMovie(data);
      setLoading(false);
    }
    load();
  }, [id]);

  if (authLoading || loading) {
    return <div className="flex h-screen items-center justify-center bg-black"><div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent"/></div>;
  }

  if (!user) {
    return <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4"><Film className="h-16 w-16 text-red-600"/><h2 className="text-2xl font-bold">Login necessario</h2><button onClick={() => navigate('/login')} className="rounded-xl bg-red-600 px-8 py-3 font-semibold">Entrar</button></div>;
  }

  const videoUrl = movie?.video_url || '';
  const isBunny = videoUrl.includes('bunnycdn') || videoUrl.includes('b-cdn.net') || videoUrl.includes('mediadelivery');

  function getEmbed(url: string) {
    const m = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (m) return 'https://iframe.mediadelivery.net/embed/723294/' + m[1] + '?autoplay=true';
    return url;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 rounded-full bg-black/50 p-2.5 backdrop-blur transition hover:bg-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold">{movie?.title || 'Player'}</h1>
      </div>

      <div className="relative w-full bg-black pt-16">
        {isBunny ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <iframe src={getEmbed(videoUrl)} className="absolute inset-0 w-full h-full border-0" allow="autoplay; fullscreen" allowFullScreen title={movie?.title || 'Video'} />
          </div>
        ) : videoUrl ? (
          <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
            <video controls playsInline preload="auto" className="w-full h-full" style={{ backgroundColor: '#000', maxHeight: '80vh' }} poster={movie?.backdrop_url || movie?.poster_url}>
              <source src={videoUrl} type="video/mp4" />
            </video>
          </div>
        ) : (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center gap-4">
            <Film className="h-16 w-16 text-zinc-600" />
            <h2 className="text-xl font-bold">Video nao disponivel</h2>
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
