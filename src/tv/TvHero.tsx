import { Info, Play, Star } from 'lucide-react';
import type { TvItem } from './tvUi';
import { formatDuration, formatYear, ratingLabel } from './tvUi';

/**
 * TvHero — destaque da Home.
 *
 * Imita o hero do Mobile/Web: backdrop real do título, badges (Dublado PT-BR,
 * qualidade), nota, ano, duração, gêneros e os dois botões principais
 * "Assistir" e "Mais informações".
 *
 * Diferença proposital em relação ao antigo hero da TV: altura COMPACTA
 * (~42vh). O usuário precisa enxergar as primeiras linhas de filmes e séries
 * sem precisar rolar — antes o hero sozinho ocupava a tela inteira.
 */
export function TvHero({
  item,
  onAssistir,
  onDetalhes,
}: {
  item: TvItem;
  onAssistir: (item: TvItem) => void;
  onDetalhes: (item: TvItem) => void;
}) {
  const categorias = (item.category || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <section className="tv-hero">
      {item.backdrop ? (
        <div className="tv-hero-bg" style={{ backgroundImage: `url(${item.backdrop})` }} />
      ) : null}
      <div className="tv-hero-shade" />

      <div className="tv-hero-inner">
        <div className="tv-hero-badges">
          <span className="tv-hero-badge tv-hero-badge-destaque">
            {item.type === 'series' ? 'Série em destaque' : 'Filme em destaque'}
          </span>
          {item.dublado ? <span className="tv-hero-badge tv-hero-badge-dublado">Dublado PT-BR</span> : null}
          {item.quality ? <span className="tv-hero-badge">{item.quality}</span> : null}
        </div>

        <h1 className="tv-hero-title">{item.title}</h1>

        <div className="tv-hero-meta">
          {item.vote && item.vote > 0 ? (
            <span className="tv-hero-star">
              <Star
                className="tv-icon-sm"
                style={{ width: '1.3vh', height: '1.3vh', display: 'inline', verticalAlign: '-0.1vh' }}
                fill="currentColor"
              />{' '}
              {ratingLabel(item.vote)}
            </span>
          ) : null}
          {formatYear(item.year) ? <span>{item.year}</span> : null}
          {item.duration ? <span>{formatDuration(item.duration)}</span> : null}
          {categorias.length > 0 ? <span>{categorias.join(' · ')}</span> : null}
        </div>

        {item.description ? <p className="tv-hero-desc">{item.description}</p> : null}

        <div className="tv-hero-actions">
          <button
            data-tv-focusable
            data-tv-initial-focus
            tabIndex={0}
            className="tv-btn tv-btn-primary tv-btn-lg"
            onClick={() => onAssistir(item)}
          >
            <Play className="tv-icon" fill="currentColor" />
            Assistir
          </button>
          <button
            data-tv-focusable
            tabIndex={0}
            className="tv-btn tv-btn-ghost tv-btn-lg"
            onClick={() => onDetalhes(item)}
          >
            <Info className="tv-icon" />
            Mais informações
          </button>
        </div>
      </div>
    </section>
  );
}
