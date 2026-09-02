import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMovies } from '@/hooks/useMovies';
import { useCatalogWatchHistory } from '@/hooks/useWatchHistory';
import { TvPosterCard } from './TvPosterCard';
import { groupByCategory, type TvItem } from './tvUi';

/**
 * TvHomePage — início do MovieFlix TV.
 *
 * Layout pensado para controle remoto:
 *  - 1ª linha: "Continuar assistindo" (se houver progresso salvo)
 *  - 2ª linha: "Lançamentos" (mais recentes)
 *  - 3ª linha: "Mais assistidos" (melhor nota)
 *  - depois: categorias (cada uma numa linha horizontal)
 *
 * Navegação: ← → horizontal dentro da linha, ↑ ↓ entre linhas
 * (o useTvNavigation global resolve por posição). Foco sempre visível.
 */

export function TvHomePage() {
  const navigate = useNavigate();
  const movies = useMovies();
  const history = useCatalogWatchHistory();

  const sections = useMemo(() => {
    const base = movies.data ?? [];
    if (!base.length) return [];
    const filmes = base.filter((m) => m.type !== 'series');

    const toItem = (m: (typeof base)[number]): TvItem => ({
      id: m.id,
      title: m.title,
      poster: m.poster_url,
      backdrop: m.backdrop_url,
      year: m.year,
      quality: m.quality,
      vote: m.vote_average,
      category: m.category,
      duration: m.duration,
      type: m.type === 'series' ? 'series' : 'movie',
    });

    const lancamentos = [...filmes].sort((a, b) => Number(b.year || 0) - Number(a.year || 0)).slice(0, 24).map(toItem);
    const populares = [...base].sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0)).slice(0, 24).map(toItem);
    const cats = groupByCategory(base.map(toItem)).filter((s) => s.items.length >= 4).slice(0, 8);

    const list: { id: string; label: string; items: TvItem[] }[] = [];
    const cont = (history.items ?? []).slice(0, 20).map((h) => h.movie).filter(Boolean).map(toItem);
    if (cont.length) list.push({ id: 'continuar', label: 'Continuar assistindo', items: cont });
    list.push({ id: 'lancamentos', label: 'Lançamentos', items: lancamentos });
    list.push({ id: 'populares', label: 'Mais assistidos', items: populares });
    for (const c of cats) list.push({ id: `cat-${c.id}`, label: c.label, items: c.items.slice(0, 24) });
    return list;
  }, [movies.data, history.items]);

  if (movies.isLoading && !movies.data) {
    return (
      <div className="tv-page">
        <div className="tv-loading">
          <div className="tv-loading-spinner" />
          <p>Carregando catálogo…</p>
        </div>
      </div>
    );
  }

  if (movies.isError && !movies.data) {
    return (
      <div className="tv-page">
        <div className="tv-error">
          <h2>Não foi possível carregar o conteúdo</h2>
          <p>Tente novamente em instantes.</p>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!sections.length) {
    return (
      <div className="tv-page">
        <div className="tv-error">
          <h2>Catálogo vazio</h2>
          <p>Nenhum título disponível no momento.</p>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/tv/pesquisa')}>
            Ir para Pesquisar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page tv-page-home">
      <div className="tv-hero">
        <div className="tv-hero-title">MovieFlix <em>TV</em></div>
        <div className="tv-hero-sub">Filmes e séries dublados em pt-BR, feito para controle remoto</div>
      </div>
      {sections.map((sec) => (
        <section key={sec.id} className="tv-section">
          <h2 className="tv-section-title">{sec.label}</h2>
          <div className="tv-row">
            {sec.items.map((item, i) => (
              <TvPosterCard key={item.id} item={item} index={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
