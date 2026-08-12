import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History as HistoryIcon, Trash2, Film, Check, AlertTriangle, RotateCcw, Clock } from 'lucide-react';
import { useWatchHistory, useRemoveHistory, useClearHistory, useMarkAsWatched } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { img } from '@/lib/tmdb';
import { formatTime, formatFriendlyDate } from '@/lib/timeFormat';
import type { WatchHistoryRow } from '@/types';

/** Retoma no player do catálogo quando o título é conhecido; senão vai à página do título. */
function historyTarget(h: WatchHistoryRow, fromStart = false): string {
  if (!h.movie_id) return `/titulo/${h.media_type}/${h.tmdb_id}`;
  if (fromStart) return `/assistir/${h.movie_id}`;
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

export function HistoryPage() {
  const { user } = useAuth();
  const history = useWatchHistory();
  const remove = useRemoveHistory();
  const clear = useClearHistory();
  const markWatched = useMarkAsWatched();
  const [validMovieIds, setValidMovieIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    async function loadValidMovies() {
      const { data } = await supabase.from('movies').select('id');
      if (data) {
        setValidMovieIds(new Set(data.map((m: any) => m.id)));
      }
    }
    loadValidMovies();
  }, []);

  if (!user) {
    return (
      <div className="container-app flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-ink-400">Faça login para ver seu histórico.</p>
        <Link to="/login" className="btn-primary">Entrar</Link>
      </div>
    );
  }

  const allItems = history.data ?? [];
  const items = allItems.filter((h) => h.movie_id && validMovieIds.has(h.movie_id));

  // Agrupa por data
  const grouped = items.reduce((acc, h) => {
    const key = formatFriendlyDate(h.updated_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {} as Record<string, WatchHistoryRow[]>);

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">Histórico</h1>
          <p className="mt-1 text-sm text-ink-400">Tudo o que você assistiu recentemente.</p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="rounded-lg bg-red-600/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-600/30"
          >
            Limpar tudo
          </button>
        )}
      </div>

      {/* Modal de confirmação */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
            <h3 className="mt-3 text-lg font-bold text-white">Limpar histórico?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Isso removerá todos os {items.length} itens do seu histórico. Esta ação não pode ser desfeita.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Cancelar
              </button>
              <button
                onClick={() => { clear.mutate(); setShowClearConfirm(false); }}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-500"
              >
                Sim, limpar
              </button>
            </div>
          </div>
        </div>
      )}

      {history.isLoading ? (
        <p className="mt-8 text-ink-400">Carregando</p>
      ) : items.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center gap-4 text-center">
          <HistoryIcon className="h-12 w-12 text-ink-600" />
          <p className="text-ink-400">Seu histórico está vazio.</p>
          <Link to="/" className="btn-primary">Explorar catálogo</Link>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {Object.entries(grouped).map(([dateLabel, groupItems]) => (
            <div key={dateLabel}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-500">{dateLabel}</h2>
              <div className="space-y-3">
                {groupItems.map((h) => {
                  const progress = getProgress(h);
                  const watched = isWatched(h);
                  return (
                    <div key={h.id} className="group flex items-center gap-4 rounded-xl border border-white/5 bg-ink-900/50 p-3 transition hover:border-white/10 hover:bg-ink-900">
                      <Link to={historyTarget(h)} className="flex-shrink-0">
                        <div className="relative h-20 w-36 overflow-hidden rounded-lg bg-ink-800">
                          {h.backdrop_path ? (
                            <img src={img(h.backdrop_path, 'w300')} alt={h.title} className="h-full w-full object-cover" loading="lazy" />
                          ) : h.poster_path ? (
                            <img src={img(h.poster_path, 'w300')} alt={h.title} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-ink-500">
                              <Film className="h-6 w-6" />
                            </div>
                          )}
                          {/* Badge de progresso */}
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                            <div className={`h-full transition-all ${watched ? 'bg-green-500' : 'bg-brand-600'}`} style={{ width: `${progress}%` }} />
                          </div>
                          {watched && (
                            <div className="absolute right-1 top-1 rounded-full bg-green-600/90 p-1">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                      </Link>

                      <div className="flex-1 min-w-0">
                        <Link to={historyTarget(h)} className="font-semibold text-white hover:text-brand-300 truncate block">
                          {h.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-400">
                          <span className="rounded bg-white/5 px-1.5 py-0.5">{h.media_type === 'tv' ? 'Série' : 'Filme'}</span>
                          {watched ? (
                            <span className="text-green-400">Assistido</span>
                          ) : (
                            <>
                              <span>{progress}% assistido</span>
                              <span>•</span>
                              <span className="text-ink-500">
                                <Clock className="inline h-3 w-3 mr-0.5" />
                                {formatTime(h.position_seconds)} / {formatTime(h.duration_seconds || 0)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        {!watched && (
                          <>
                            <Link
                              to={historyTarget(h, true)}
                              className="rounded-full p-2 text-ink-400 transition hover:bg-white/10 hover:text-white"
                              title="Assistir do início"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => markWatched.mutate(h.id)}
                              className="rounded-full p-2 text-ink-400 transition hover:bg-green-600/20 hover:text-green-400"
                              title="Marcar como assistido"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {watched && (
                          <button
                            onClick={() => remove.mutate(h.id)}
                            className="rounded-full p-2 text-ink-400 transition hover:bg-red-600/20 hover:text-red-400"
                            title="Remover do histórico"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
