import { memo } from 'react';
import { Mic2, Play, Star } from 'lucide-react';
import type { TvItem } from './tvUi';
import { formatDuration, formatYear, ratingLabel } from './tvUi';
import { cn } from '@/lib/cn';

/**
 * TvPosterCard — card de pôster para TV.
 *
 * Segue a linguagem visual do card do site (src/components/cards/PosterCard.tsx):
 * pôster 2:3 com bordas arredondadas, selo verde "Dublado PT-BR", botão circular
 * de reprodução com o gradiente da marca, indicador de favorito, barra de
 * progresso e título abaixo do pôster.
 *
 * Adaptações para televisão:
 *  - dimensões proporcionais à altura da tela (720p/1080p/4K) via CSS;
 *  - foco grande e inequívoco (anel vermelho/branco + glow roxo);
 *  - o indicador de favorito NÃO é um ponto de foco do D-pad (mantém a
 *    navegação da grade com 1 parada por card — o favorito é alternado na
 *    página de Detalhes, como em qualquer app de streaming de TV).
 *
 * FOCO / OK — O QUE MUDOU NESTA VERSÃO (causa raiz do "OK abre duas telas")
 * ════════════════════════════════════════════════════════════════════════════
 * O card tinha um `onKeyDown` PRÓPRIO que chamava `onAbrir(item)` ao ver
 * Enter/keyCode 23. Só que a navegação espacial global (`useTvNavigation`, em
 * fase de CAPTURA) já trata o OK de qualquer elemento com `data-tv-focusable`
 * chamando `ativo.click()`.
 *
 * Resultado: DUAS ativações para a MESMA pulsação de OK —
 *   1. `onKeyDown` do card → `onAbrir(item)` → navega para `/tv/titulo/:id`;
 *   2. `ativo.click()` da navegação → mais uma navegação.
 * Como a navegação usa `push`, o histórico ganhava uma entrada duplicada: o
 * usuário caía nos detalhes e, ao apertar Voltar, voltava para os detalhes de
 * novo (parecia que o Voltar "não funcionava") — e havia o risco de a segunda
 * navegação competir com a primeira.
 *
 * O `onKeyDown` foi REMOVIDO: o OK tem UM único dono por elemento (o `onClick`,
 * acionado pela navegação espacial, que é quem já entrega setas + anel de foco).
 * É a mesma regra que o formulário de login segue ("um dono por tecla").
 *
 * `memo`: a grade renderiza dezenas de cards; sem isso cada tecla do controle
 * re-renderiza todos os cards.
 */
export const TvPosterCard = memo(function TvPosterCard({
  item,
  progress,
  onAbrir,
  onFavorito,
  favorito,
}: {
  item: TvItem;
  /** Progresso real (0-100) — usado em "Continuar assistindo". */
  progress?: number;
  onAbrir: (item: TvItem) => void;
  onFavorito?: (item: TvItem) => void;
  favorito?: boolean;
}) {
  const titulo = item.title;

  return (
    <div
      data-tv-card
      data-tv-focusable
      tabIndex={0}
      className="tv-card"
      role="button"
      aria-label={titulo}
      onClick={() => onAbrir(item)}
    >
      <div className="tv-card-poster">
        {item.poster ? (
          <img src={item.poster} alt={titulo} loading="lazy" decoding="async" />
        ) : (
          <div className="tv-card-placeholder" aria-hidden>
            MF
          </div>
        )}

        <div className="tv-card-veil" />

        {/* Selo de idioma — dado real do catálogo (nunca inventado). */}
        {item.dublado ? (
          <span className="tv-card-dublado">
            <Mic2 className="tv-icon-sm" style={{ width: '1.1vh', height: '1.1vh' }} />
            Dublado PT-BR
          </span>
        ) : null}

        {item.quality ? <span className="tv-card-quality">{item.quality}</span> : null}

        <span className="tv-card-play" aria-hidden>
          <Play
            className="tv-icon-sm"
            style={{ width: '1.6vh', height: '1.6vh' }}
            fill="currentColor"
          />
        </span>

        {/* Indicador de favorito (não é parada do D-pad). */}
        {onFavorito ? (
          <div
            className={cn('tv-card-fav', favorito && 'tv-card-fav-ativo')}
            role="presentation"
            onClick={(e) => {
              e.stopPropagation();
              onFavorito(item);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="1.6vh"
              height="1.6vh"
              fill={favorito ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
        ) : null}

        {typeof progress === 'number' && progress > 0 ? (
          <div className="tv-card-progress">
            <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        ) : null}
      </div>

      <div className="tv-card-title" title={titulo}>
        {titulo}
      </div>
      <div className="tv-card-meta">
        {[formatYear(item.year), item.duration ? formatDuration(item.duration) : '', item.type === 'series' ? 'Série' : '']
          .filter(Boolean)
          .join(' · ')}
        {item.vote && item.vote > 0 ? (
          <span>
            {' · '}
            <Star
              className="tv-icon-sm"
              style={{ width: '1.1vh', height: '1.1vh', display: 'inline', verticalAlign: '-0.1vh', color: '#fbbf24' }}
              fill="currentColor"
            />
            {' '}
            {ratingLabel(item.vote)}
          </span>
        ) : null}
      </div>
    </div>
  );
});
