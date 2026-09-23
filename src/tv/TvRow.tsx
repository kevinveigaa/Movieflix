import type { TvItem } from './tvUi';
import { TvPosterCard } from './TvPosterCard';
import { cn } from '@/lib/cn';

/**
 * TvRow — linha horizontal de cards ("Em alta", "Filmes", "Séries"...).
 *
 * A linha rola dentro de si mesma: mover o foco para um card fora da área
 * visível dispara o scroll automático do próprio navegador, então o D-pad nunca
 * fica "preso" na borda. Não há botão de seta — em TV o usuário navega com o
 * controle, exatamente como no resto do app.
 */
export function TvRow({
  title,
  items,
  onAbrir,
  onVerTodos,
  progressoDe,
}: {
  title: string;
  items: TvItem[];
  onAbrir: (item: TvItem) => void;
  onVerTodos?: () => void;
  /** Progresso real (0-100) por item — usado em "Continuar assistindo". */
  progressoDe?: (item: TvItem) => number | undefined;
}) {
  if (items.length === 0) return null;

  return (
    <section className="tv-section">
      <h2 className="tv-section-title">
        {title}
        <span className="tv-section-count">({items.length})</span>
        {onVerTodos ? (
          <button
            data-tv-focusable
            tabIndex={0}
            className="tv-section-link"
            onClick={onVerTodos}
          >
            Ver todos
          </button>
        ) : null}
      </h2>
      <div className={cn('tv-row')}>
        {items.map((item) => (
          <div key={`${item.type}-${item.id}`} className="tv-row-slot">
            <TvPosterCard
              item={item}
              progress={progressoDe?.(item)}
              onAbrir={onAbrir}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
