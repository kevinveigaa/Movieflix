import { useState } from 'react';
import { Link } from 'react-router-dom';
import { History as HistoryIcon, Trash2, Film, Check, AlertTriangle, Play } from 'lucide-react';
import { useCatalogWatchHistory, useRemoveHistory, useClearHistory, useMarkAsWatched } from '@/hooks/useWatchHistory';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useAuth } from '@/context/AuthContext';
import { ehSerie } from '@/lib/media';
import type { WatchHistoryRow } from '@/types';

/** Retoma no player do catálogo quando o título é conhecido; senão vai à página do título. */
function historyTarget(h: WatchHistoryRow): string {
  if (!h.movie_id) return `/titulo/${h.media_type}/${h.tmdb_id}`;
  const pct = h.duration_seconds ? h.position_seconds / h.duration_seconds : 0;
  // Se assistiu entre 2% e 95%, continua de onde parou
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
  const history = useCatalogWatchHistory();
  const remove = useRemoveHistory();
  const clear = useClearHistory();
  const markWatched = useMarkAsWatched();
  const { seriesHidden } = useSeriesHidden();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (!user) {
    return (
      <div className="container-app flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-ink-400">Faça login para ver seu histórico.</p>
        <Link to="/login" className="btn-primary">Entrar</Link>
      </div>
    );
  }

  // Só registros que existem no catálogo real (useCatalogWatchHistory já filtra).
  // Séries ocultas: remove os registros de séries.
  const items = (history.items ?? [])
    .filter(({ movie }) => !seriesHidden || !ehSerie(movie))
    .map(({ history: h, movie }) => ({ h, movie }));

  // Títulos que podem ser retomados (progresso entre 2% e 95%).
  const continuar = items.filter(({ h }) => {
    const pct = h.duration_seconds ? h.position_seconds / h.duration_seconds : 0;
    return pct >= 0.02 && pct < 0.95;
  });

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

      {/* Modal de confirmação para limpar tudo */}
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
                onClick={() => {
                  clear.mutate();
                  setShowClearConfirm(false);
                }}
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
        <div className="mt-8 divide-y divide-white/5">
          {items.map(({ h, movie }) => {
            const progress = getProgress(h);
            const watched = isWatched(h);
            const poster = movie.backdrop_url || movie.poster_url;
            return (
              <div key={h.id} className="flex items-center gap-4 py-4">
                <Link to={historyTarget(h)} className="flex-shrink-0">
                  <div className="h-16 w-28 overflow-hidden rounded-lg bg-ink-800 relative">
                    {poster ? (
                      <img src={poster} alt={movie.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-ink-500">
                        <Film className="h-6 w-6" />
                      </div>
                    )}
                    {/* Barra de progresso */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-red-600 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={historyTarget(h)} className="font-semibold text-white hover:text-roxo-300 truncate block">
                    {movie.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {ehSerie(movie) ? 'Série' : 'Filme'} • {watched ? 'Assistido' : `${progress}% assistido`}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Atualizado em {new Date(h.updated_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Marcar como assistido */}
                  {!watched && (
                    <button
                      onClick={() => markWatched.mutate(h.id)}
                      className="rounded-full p-2 text-ink-400 transition hover:bg-green-600/20 hover:text-green-400"
                      title="Marcar como assistido"
                      aria-label="Marcar como assistido"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {/* Remover do histórico */}
                  <button
                    onClick={() => remove.mutate(h.id)}
                    className="rounded-full p-2 text-ink-400 transition hover:bg-red-600/20 hover:text-red-400"
                    aria-label="Remover do histórico"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}