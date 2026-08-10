import { Link } from 'react-router-dom';
import { History as HistoryIcon, Trash2 } from 'lucide-react';
import { useWatchHistory, useRemoveHistory } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { img } from '@/lib/tmdb';
import type { WatchHistoryRow } from '@/types';

/** Retoma no player do catálogo quando o título é conhecido; senão vai à página do título. */
function historyTarget(h: WatchHistoryRow): string {
  return h.movie_id ? `/assistir/${h.movie_id}` : `/titulo/${h.media_type}/${h.tmdb_id}`;
}

export function HistoryPage() {
  const { user } = useAuth();
  const history = useWatchHistory();
  const remove = useRemoveHistory();

  if (!user) {
    return (
      <div className="container-app flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-ink-400">Faça login para ver seu histórico.</p>
        <Link to="/login" className="btn-primary">Entrar</Link>
      </div>
    );
  }

  const items = history.data ?? [];

  return (
    <div className="container-app py-8">
      <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">Histórico</h1>
      <p className="mt-1 text-sm text-ink-400">Tudo o que você assistiu recentemente.</p>

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
          {items.map((h) => (
            <div key={h.id} className="flex items-center gap-4 py-4">
              <Link to={historyTarget(h)} className="flex-shrink-0">
                <div className="h-16 w-28 overflow-hidden rounded-lg bg-ink-800">
                  {h.backdrop_path ? (
                    <img src={img(h.backdrop_path, 'w300')} alt={h.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-ink-500">{h.title}</div>
                  )}
                </div>
              </Link>
              <div className="flex-1">
                <Link to={historyTarget(h)} className="font-semibold text-white hover:text-brand-300">
                  {h.title}
                </Link>
                <p className="mt-0.5 text-xs text-ink-400">
                  {h.media_type === 'tv' ? 'Série' : 'Filme'} • Atualizado em {new Date(h.updated_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => remove.mutate(h.id)}
                className="rounded-full p-2 text-ink-400 transition hover:bg-red-600/20 hover:text-red-400"
                aria-label="Remover do histórico"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}




