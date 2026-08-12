import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Play, Plus, Check, Star, Clock, Calendar, Globe, Film, ArrowLeft, AlertCircle } from 'lucide-react';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useFavorite } from '@/hooks/useFavorite';
import { supabase } from '@/lib/supabase';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { Modal } from '@/components/ui/Modal';
import { fetchHistoryForMovie } from '@/hooks/useWatchHistory';
import type { WatchHistoryRow } from '@/types';

export function TitleDetailPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const { user, subscription, activeViewerProfile } = useAuth();
  const { entitlements } = useEntitlements();

  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [historyRow, setHistoryRow] = useState<WatchHistoryRow | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [similar, setSimilar] = useState<any[]>([]);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [activeSeason, setActiveSeason] = useState<number | null>(null);

  const movieId = id || '';
  const isTv = type === 'tv' || movie?.type === 'series' || movie?.type === 'tv';

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data: catalogMovie } = await supabase.from('movies').select('*').eq('id', movieId).maybeSingle();
        if (catalogMovie) {
          setMovie(catalogMovie);
          if (catalogMovie.category) {
            const cats = String(catalogMovie.category).split(',').map(c => c.trim()).filter(Boolean);
            const { data: simData } = await supabase.from('movies').select('*').neq('id', movieId)
              .or(cats.map(c => `category.ilike.%${c}%`).join(',')).limit(12);
            setSimilar(simData || []);
          }
          if (catalogMovie.type === 'series' || catalogMovie.type === 'tv' || catalogMovie.number_of_seasons > 0) {
            const { data: seasData } = await supabase.from('seasons').select('*').eq('series_id', movieId).order('season_number', { ascending: true });
            setSeasons(seasData || []);
            if (seasData && seasData.length > 0) {
              setActiveSeason(seasData[0].id);
              const { data: epsData } = await supabase.from('episodes').select('*').eq('season_id', seasData[0].id).order('episode_number', { ascending: true });
              setEpisodes(epsData || []);
            }
          }
        } else {
          setMovie({ id: movieId, title: 'Título não encontrado' });
        }
        if (user) {
          const h = await fetchHistoryForMovie(user.id, activeViewerProfile?.id || null, movieId);
          setHistoryRow(h);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [movieId, type, user, activeViewerProfile?.id]);

  const favHook = movie && !isNaN(Number(movieId)) ? useFavorite(Number(movieId), isTv ? 'tv' : 'movie') : null;
  const isFav = favHook?.isFavorite ?? false;
  const toggleFav = favHook?.toggle;
  const canWatch = hasActiveSubscription(subscription) || movie?.type === 'trailer';

  const handleWatch = () => {
    if (!canWatch) { navigate('/minha-assinatura'); return; }
    if (historyRow && historyRow.position_seconds > 10) {
      const pct = historyRow.duration_seconds ? historyRow.position_seconds / historyRow.duration_seconds : 0;
      if (pct >= 0.02 && pct < 0.95) { setShowResumeModal(true); return; }
    }
    navigate(`/assistir/${movieId}`);
  };

  const handleResume = () => navigate(`/assistir/${movieId}?t=${historyRow?.position_seconds || 0}`);

  const handleSeasonChange = async (seasonId: number) => {
    setActiveSeason(seasonId);
    const { data } = await supabase.from('episodes').select('*').eq('season_id', seasonId).order('episode_number', { ascending: true });
    setEpisodes(data || []);
  };

  if (loading) return <DetailSkeleton />;
  if (!movie || movie.title === 'Título não encontrado') {
    return (
      <div className="container-app flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-16 w-16 text-ink-600" />
        <h1 className="text-2xl font-bold text-white">Título não encontrado</h1>
        <p className="text-ink-400">Este conteúdo não está disponível no catálogo.</p>
        <Link to="/" className="btn-primary">Voltar ao início</Link>
      </div>
    );
  }

  const generos = String(movie.category || '').split(',').map(c => c.trim()).filter(Boolean);
  const year = movie.year || (movie.created_at ? new Date(movie.created_at).getFullYear() : '');
  const duration = movie.runtime ? `${movie.runtime} min` : movie.duration ? `${movie.duration} min` : '';
  const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : null;

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="relative h-[50vh] min-h-[300px] w-full sm:h-[55vh] lg:h-[65vh]">
        <img src={movie.backdrop_url || movie.poster_url} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/90 via-ink-950/40 to-transparent" />
        <button onClick={() => navigate(-1)} className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/70 sm:left-6 sm:top-6" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="container-app relative -mt-32 sm:-mt-40 lg:-mt-48">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
          <div className="shrink-0 mx-auto lg:mx-0">
            <div className="w-48 sm:w-56 lg:w-64 overflow-hidden rounded-2xl shadow-2xl shadow-black/50">
              <img src={movie.poster_url} alt={movie.title} className="h-full w-full object-cover" />
            </div>
          </div>
          <div className="flex-1 space-y-5 pb-8">
            <div>
              <h1 className="text-3xl font-extrabold text-white sm:text-4xl lg:text-5xl">{movie.title}</h1>
              {movie.original_title && movie.original_title !== movie.title && <p className="mt-1 text-sm text-ink-400">{movie.original_title}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {rating && Number(rating) > 0 && <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-sm font-bold text-amber-300"><Star className="h-4 w-4 fill-amber-300" />{rating}</span>}
              {year && <span className="flex items-center gap-1 text-sm text-ink-300"><Calendar className="h-4 w-4" />{year}</span>}
              {duration && <span className="flex items-center gap-1 text-sm text-ink-300"><Clock className="h-4 w-4" />{duration}</span>}
              {movie.language && <span className="flex items-center gap-1 text-sm text-ink-300"><Globe className="h-4 w-4" />{movie.language}</span>}
              {movie.quality && <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-bold text-white">{movie.quality}</span>}
            </div>
            {generos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {generos.map((g) => <span key={g} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ink-200">{g}</span>)}
              </div>
            )}
            <p className="max-w-2xl text-sm leading-relaxed text-ink-200 sm:text-base">{movie.description || 'Sinopse não disponível.'}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button onClick={handleWatch} className="btn-primary px-6 py-3">
                <Play className="h-5 w-5" fill="currentColor" /> {canWatch ? 'Assistir Agora' : 'Assine para assistir'}
              </button>
              {toggleFav && (
                <button onClick={() => toggleFav()} className={`btn-ghost px-6 py-3 ${isFav ? 'text-brand-400' : ''}`}>
                  {isFav ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />} {isFav ? 'Na Minha Lista' : 'Adicionar à Lista'}
                </button>
              )}
            </div>
            {!canWatch && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                Assine um plano para assistir este conteúdo. <Link to="/minha-assinatura" className="font-semibold underline">Ver planos</Link>
              </div>
            )}
          </div>
        </div>

        {/* Seasons & Episodes */}
        {seasons.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">Episódios</h2>
              <select value={activeSeason ?? ''} onChange={(e) => handleSeasonChange(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-ink-800 px-3 py-1.5 text-sm text-white">
                {seasons.map((s) => <option key={s.id} value={s.id}>Temporada {s.season_number}</option>)}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => (
                <Link key={ep.id} to={`/assistir/${movieId}?episode=${ep.id}`}
                  className="flex gap-3 rounded-xl border border-white/10 bg-ink-900/50 p-3 transition hover:bg-white/5">
                  <div className="h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                    {ep.thumbnail_url ? <img src={ep.thumbnail_url} alt={ep.title} className="h-full w-full object-cover" /> : <Film className="h-full w-full p-6 text-ink-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">E{ep.episode_number}: {ep.title}</p>
                    <p className="mt-1 text-xs text-ink-400 line-clamp-2">{ep.description || ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Similar */}
        {similar.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white mb-4">Títulos semelhantes</h2>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6">
              {similar.map((m) => (
                <PosterCard key={m.id} title={{ id: m.id, title: m.title, poster_url: m.poster_url, quality: m.quality ?? 'HD', type: m.type ?? 'movie', year: m.year, vote_average: m.vote_average, category: m.category }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal open={showResumeModal} onClose={() => setShowResumeModal(false)}>
        <div className="text-center">
          <h3 className="text-lg font-bold text-white">Continuar assistindo?</h3>
          <p className="mt-2 text-sm text-ink-300">Você parou em {formatTime(historyRow?.position_seconds || 0)}.</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => { setShowResumeModal(false); navigate(`/assistir/${movieId}`); }} className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">Assistir do início</button>
            <button onClick={() => { setShowResumeModal(false); handleResume(); }} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500">Continuar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="h-[50vh] min-h-[300px] animate-pulse bg-ink-800/70 sm:h-[55vh] lg:h-[65vh]" />
      <div className="container-app relative -mt-32 sm:-mt-40 lg:-mt-48">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
          <div className="shrink-0 mx-auto lg:mx-0"><div className="w-48 sm:w-56 lg:w-64 aspect-[2/3] rounded-2xl bg-ink-800 skeleton" /></div>
          <div className="flex-1 space-y-4">
            <div className="h-10 w-3/4 rounded-lg bg-ink-800 skeleton" />
            <div className="h-4 w-1/2 rounded bg-ink-800 skeleton" />
            <div className="h-4 w-full rounded bg-ink-800 skeleton" />
            <div className="h-4 w-5/6 rounded bg-ink-800 skeleton" />
            <div className="flex gap-3 pt-2"><div className="h-10 w-32 rounded-xl bg-ink-800 skeleton" /><div className="h-10 w-40 rounded-xl bg-ink-800 skeleton" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
