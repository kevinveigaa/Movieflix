import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMovies, useMoviesOnly, useSeriesOnly } from '@/hooks/useMovies';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useCatalogWatchHistory } from '@/hooks/useWatchHistory';
import { useAuth } from '@/context/AuthContext';
import { TvHero } from './TvHero';
import { TvRow } from './TvRow';
import { TvVazio } from './TvStates';
import {
  dedupeContinuar,
  groupByCategory,
  paraTvItem,
  type TvItem,
} from './tvUi';
import { embaralhar } from './tvSeed';

/** Quantos títulos por linha na Home (e quantas linhas de categoria). */
const POR_LINHA = 24;
const MAX_LINHAS_CATEGORIA = 7;
const MAX_LINHA_CATALOGO = 60;

/**
 * TvHomePage — Home da experiência de TV.
 *
 * Estrutura (espelha a Home do Mobile/Web, adaptada para 16:9):
 *   HERO → CONTINUAR ASSISTINDO → EM ALTA → LANÇAMENTOS → FILMES → SÉRIES → CATEGORIAS
 *
 * TODOS os dados vêm do catálogo REAL (useMovies/useMoviesOnly/useSeriesOnly),
 * os mesmos hooks do site e do app Mobile. Não existe catálogo, JSON ou lista
 * paralela para a TV — a diferença é só a interface.
 */
export function TvHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const filmes = useMoviesOnly();
  const series = useSeriesOnly();
  const tudo = useMovies();
  const { seriesHidden } = useSeriesHidden();
  const historico = useCatalogWatchHistory();

  const itensFilmes = useMemo(
    () => (filmes.data ?? []).map(paraTvItem),
    [filmes.data],
  );
  const itensSeries = useMemo(
    () => (seriesHidden ? [] : (series.data ?? []).map(paraTvItem)),
    [series.data, seriesHidden],
  );

  /** Destaque: melhor nota do catálogo real (determinístico). */
  const destaque = useMemo<TvItem | null>(() => {
    const todos = [...itensFilmes, ...itensSeries];
    if (todos.length === 0) return null;
    return [...todos]
      .filter((m) => (m.vote ?? 0) > 0 && m.backdrop)
      .sort((a, b) => (b.vote ?? 0) - (a.vote ?? 0))[0] ?? todos[0];
  }, [itensFilmes, itensSeries]);

  /**
   * "Continuar assistindo" — DEDUPLICADO NA ORIGEM por título.
   * O histórico grava uma linha por EPISÓDIO; sem dedupe a mesma série aparecia
   * várias vezes seguidas.
   */
  const continuar = useMemo(() => {
    const deduplicado = dedupeContinuar(historico.items);
    return deduplicado.map(({ history, movie }) => ({
      item: paraTvItem(movie),
      progresso:
        history.duration_seconds > 0
          ? Math.min(100, Math.round((history.position_seconds / history.duration_seconds) * 100))
          : 0,
    }));
  }, [historico.items]);

  const emAlta = useMemo(
    () => embaralhar([...itensFilmes, ...itensSeries]).slice(0, POR_LINHA),
    [itensFilmes, itensSeries],
  );

  const lancamentos = useMemo(() => {
    return [...itensFilmes]
      .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))
      .slice(0, POR_LINHA);
  }, [itensFilmes]);

  const categorias = useMemo(
    () => groupByCategory([...itensFilmes]).slice(0, MAX_LINHAS_CATEGORIA),
    [itensFilmes],
  );

  const abrir = (item: TvItem) => navigate(`/tv/titulo/${item.id}`);
  const assistir = (item: TvItem) => navigate(`/tv/assistir/${item.id}`);

  const carregando = tudo.isLoading && !tudo.data;
  const totalItens = itensFilmes.length + itensSeries.length;

  if (carregando) {
    return (
      <div className="tv-page">
        <div className="tv-page-center">
          <div className="tv-loading">
            <div className="tv-loading-spinner" />
            <p>Carregando o catálogo MovieFlix...</p>
          </div>
        </div>
      </div>
    );
  }

  // Catálogo vazio de verdade: estado neutro (nunca uma tela de erro falsa
  // nem conteúdo inventado para "preencher" a Home).
  if (totalItens === 0) {
    return (
      <div className="tv-page">
        <TvVazio
          titulo="Catálogo indisponível"
          mensagem="O catálogo MovieFlix não retornou títulos. Verifique a conexão da TV e tente novamente."
        />
      </div>
    );
  }

  return (
    <div className="tv-page tv-page-home">
      {destaque ? <TvHero item={destaque} onAssistir={assistir} onDetalhes={abrir} /> : null}

      {user && continuar.length > 0 ? (
        <TvRow
          title="Continuar assistindo"
          items={continuar.map((c) => c.item)}
          onAbrir={assistir}
          onVerTodos={() => navigate('/tv/continuar')}
          progressoDe={(item) => continuar.find((c) => c.item.id === item.id)?.progresso}
        />
      ) : null}

      <TvRow
        title="Em alta"
        items={emAlta}
        onAbrir={abrir}
      />

      <TvRow
        title="Lançamentos"
        items={lancamentos}
        onAbrir={abrir}
        onVerTodos={() => navigate('/tv/filmes?ordem=lancamentos')}
      />

      <TvRow
        title="Filmes"
        items={itensFilmes.slice(0, MAX_LINHA_CATALOGO)}
        onAbrir={abrir}
        onVerTodos={() => navigate('/tv/filmes')}
      />

      {itensSeries.length > 0 ? (
        <TvRow
          title="Séries"
          items={itensSeries.slice(0, MAX_LINHA_CATALOGO)}
          onAbrir={abrir}
          onVerTodos={() => navigate('/tv/series')}
        />
      ) : null}

      {categorias.map((cat) => (
        <TvRow
          key={cat.id}
          title={cat.label}
          items={cat.items.slice(0, POR_LINHA)}
          onAbrir={abrir}
          onVerTodos={() => navigate(`/tv/filmes?categoria=${encodeURIComponent(cat.label)}`)}
        />
      ))}
    </div>
  );
}
