import { Link } from 'react-router-dom';
import { Play, Trash2, History as HistoryIcon, RotateCcw } from 'lucide-react';
import { useWatchHistory, useRemoveHistory } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { img } from '@/lib/tmdb';
import { formatTime, formatTimeRemaining, formatFriendlyDate } from '@/lib/timeFormat';
import { FullScreenLoader } from '@/components/ui/Feedback';
import type { WatchHistoryRow } from '@/types';

/** Destino do "continuar": player do catálogo quando possível, senão página do título. */
function historyTarget(h: WatchHistoryRow, fromStart = false): string {
  if (!h.movie_id) return `/titulo/${h.media_type}/${h.tmdb_id}`;
  if (fromStart) return `/assistir/${h.movie_id}`;
  // Se tiver progresso significativo, continua de onde parou
  const pct = h.duration_seconds ? h.position_seconds / h.duration_seconds : 0;
  if (pct >= 0.02 && pct < 0.95) {
    return `/assistir/${h.movie_id}?t=${h.position_seconds}`;
  }
  return `/assistir/${h.movie_id}`;
}

function getProgress(h: WatchHistoryRow): number {
  if (!h.duration_seconds || h.duration_seconds <= 0) return 0;
  return Math.min(100, Math.round((h.position_seconds / h.duration_seconds) * 100));
}

function isWatched(h: WatchHistoryRow): boolean {
  return getProgress(h) >= 95;
}

export function ContinueWatchingPage() {
  const { user } = useAuth();
  const history = useWatchHistory();
  const remove = useRemoveHistory();

  if (!user) {
    return (
      <div className="container-app flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-ink-400">Faça login para retomar de onde parou.</p>
        <Link to="/login" className="btn-primary">Entrar</Link>
      </div>
    );
  }

  if (history.isLoading) return <FullScreenLoader label="Carregando" />;

  const items = history.data ?? [];

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
        {items.map((h) => {
          const pct = getProgress(h);
          const watched = isWatched(h);
          const remaining = formatTimeRemaining(h.position_seconds, h.duration_seconds);

          return (
            <div key={h.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
              <Link to={historyTarget(h)} className="block">
                <div className="relative aspect-video overflow-hidden bg-ink-800">
                  {h.backdrop_path ? (
                    <img src={img(h.backdrop_path, 'w780')} alt={h.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-500">{h.title}</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Badge de tempo */}
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <Play className="h-3 w-3 fill-white" />
                    {watched ? 'Assistido' : `${formatTime(h.position_seconds)} / ${formatTime(h.duration_seconds || 0)}`}
                  </div>

                  {/* Play button no hover */}
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg">
                      <Play className="h-6 w-6 fill-white" />
                    </span>
                  </span>
                </div>

                <div className="p-4">
                  <p className="truncate font-semibold text-white">{h.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
                    <span>{h.media_type === 'tv' ? 'Série' : 'Filme'}</span>
                    <span>•</span>
                    <span>{formatFriendlyDate(h.updated_at)}</span>
                    {remaining && (
                      <>
                        <span>•</span>
                        <span className="text-brand-400">{remaining}</span>
                      </>
                    )}
                  </div>

                  {/* Barra de progresso */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                      <div
                        className={`h-full rounded-full transition-all ${watched ? 'bg-green-500' : 'bg-brand-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-ink-400">{pct}%</span>
                  </div>
                </div>
              </Link>

              {/* Ações */}
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                {!watched && (
                  <Link
                    to={historyTarget(h, true)}
                    className="rounded-full bg-black/60 p-2 text-ink-200 transition hover:bg-white/20"
                    title="Assistir do início"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Link>
                )}
                <button
                  onClick={() => remove.mutate(h.id)}
                  className="rounded-full bg-black/60 p-2 text-ink-200 transition hover:bg-red-600 hover:text-white"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
