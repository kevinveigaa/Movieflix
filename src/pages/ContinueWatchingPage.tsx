import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Trash2, History as HistoryIcon } from 'lucide-react';
import { useCatalogWatchHistory, useRemoveHistory } from '@/hooks/useWatchHistory';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useAuth } from '@/context/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ehSerie } from '@/lib/media';
import { progressoPercentual, rotuloPontoParada } from '@/lib/watchProgress';
import { FullScreenLoader } from '@/components/ui/Feedback';
import type { WatchHistoryRow } from '@/types';

/** Destino do "continuar": player do catálogo quando possível, senão página do título. */
function historyTarget(h: WatchHistoryRow): string {
  return h.movie_id ? `/assistir/${h.movie_id}` : `/titulo/${h.media_type}/${h.tmdb_id}`;
}

export function ContinueWatchingPage() {
  const { user } = useAuth();
  const history = useCatalogWatchHistory();
  const remove = useRemoveHistory();
  const { seriesHidden } = useSeriesHidden();
  const { entitlements } = useEntitlements();

  // Só registros que existem no catálogo real (useCatalogWatchHistory já filtra).
  // Séries ocultas: remove os registros de séries (TMDb ou catálogo).
  // O limite de títulos guardados depende do plano (maxHistory): Básico 5, Estándar 15, Premium ilimitado.
  const items = useMemo(() => {
    let lista = history.items ?? [];
    if (seriesHidden) {
      lista = lista.filter(({ movie }) => !ehSerie(movie));
    }
    const limite = Number.isFinite(entitlements.maxHistory) ? entitlements.maxHistory : Infinity;
    return lista.slice(0, limite);
  }, [history.items, seriesHidden, entitlements.maxHistory]);

  if (!user) {
    return (
      <div className="container-app flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-ink-400">Faça login para retomar de onde parou.</p>
        <Link to="/login" className="btn-primary">Entrar</Link>
      </div>
    );
  }

  if (history.isLoading) return <FullScreenLoader label="Carregando" />;

  if (items.length === 0) {
    return (
      <div className="container-app flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <HistoryIcon className="h-12 w-12 text-ink-600" />
        <p className="text-ink-400">Você ainda não começou a assistir nada.</p>
        <Link to="/" className="btn-primary">Explorar catálogo</Link>
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">Continuar assistindo</h1>
      <p className="mt-1 text-sm text-ink-400">Retome de onde você parou.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ history: h, movie }) => {
          const pct = progressoPercentual(h.position_seconds, h.duration_seconds);
          const poster = movie.poster_url || movie.backdrop_url;
          const parouEm = rotuloPontoParada({
            position: h.position_seconds,
            duration: h.duration_seconds,
            season: (h as any).season_number ?? null,
            episode: (h as any).episode_number ?? null,
          });
          return (
            <div key={h.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
              <Link to={historyTarget(h)} className="block">
                <div className="relative aspect-video overflow-hidden bg-ink-800">
                  {poster ? (
                    <img src={poster} alt={movie.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-500">{movie.title}</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <span className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white opacity-0 transition group-hover:opacity-100">
                    <Play className="h-5 w-5 fill-white" />
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate font-semibold text-white">{movie.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {ehSerie(movie) ? 'Série' : 'Filme'}
                    {pct > 0 && <span className="ml-2 text-brand-400">• Parou em {parouEm}</span>}
                  </p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
              <button
                onClick={() => remove.mutate(h.id)}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-ink-200 opacity-0 transition hover:bg-red-600 hover:text-white group-hover:opacity-100"
                aria-label="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}