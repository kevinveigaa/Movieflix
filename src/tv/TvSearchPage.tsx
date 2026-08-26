import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMovies } from '@/hooks/useMovies';
import { TvPosterCard } from './TvPosterCard';
import { cn } from '@/lib/cn';
import type { TvItem } from './tvUi';

/**
 * TvSearchPage — busca com teclado virtual na tela.
 *
 * - Linha do termo (grande), teclado QWERTY em grade 10×3 + backspace/espaço.
 * - Navegação ← → ↑ ↓ pelo teclado; OK digita a tecla; Voltar sai da busca.
 * - Resultados em grade (filtrados por título, em tempo real).
 * - Suporta teclado físico (input real escondido recebe foco? não —
 *   o campo é exibido e focado, e as teclas de letras digitam direto).
 */

const LINHAS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ' ', '⌫', 'OK'],
];

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function TvSearchPage() {
  const navigate = useNavigate();
  const movies = useMovies();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const all = (movies.data ?? []) as TvItem[];
    const q = normalize(query.trim());
    if (!q) return [];
    return all.filter((m) => normalize(m.title).includes(q)).slice(0, 60);
  }, [movies.data, query]);

  const digitar = (k: string) => {
    if (k === '⌫') {
      setQuery((q) => q.slice(0, -1));
      return;
    }
    if (k === 'OK') {
      inputRef.current?.focus();
      return;
    }
    setQuery((q) => (q + k).slice(0, 60));
  };

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">Pesquisar</h1>

      {/* Campo de busca (físico) */}
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Digite o nome do filme ou série…"
        className="tv-search-input"
        data-tv-focusable
      />

      {/* Teclado virtual */}
      <div className="tv-keyboard">
        {LINHAS.map((linha, li) => (
          <div key={li} className="tv-keyboard-row">
            {linha.map((k) => (
              <button
                key={k}
                data-tv-focusable
                tabIndex={0}
                className={cn(
                  'tv-key',
                  k === ' ' && 'tv-key-space',
                  (k === '⌫' || k === 'OK') && 'tv-key-fn',
                )}
                onClick={() => digitar(k)}
              >
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="tv-search-hint">
        {focused ? 'Use o teclado físico para digitar' : 'Navegue com ← → e pressione OK para digitar'}
      </div>

      {query.trim() ? (
        results.length === 0 ? (
          <div className="tv-error">
            <h2>Nada encontrado</h2>
            <p>Nenhum título com “{query}”.</p>
          </div>
        ) : (
          <div className="tv-grid">
            {results.map((item, i) => (
              <TvPosterCard key={item.id} item={item} index={i} />
            ))}
          </div>
        )
      ) : (
        <div className="tv-error tv-error-muted">
          <h2>Busque pelo título</h2>
          <p>Ex.: “Avatar”, “Vingadores”, “Stranger Things”…</p>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/tv/filmes')}>
            Ver catálogo completo
          </button>
        </div>
      )}
    </div>
  );
}
