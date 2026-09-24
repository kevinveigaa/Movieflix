import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMovies } from '@/hooks/useMovies';
import { TvPosterCard } from './TvPosterCard';
import { cn } from '@/lib/cn';
import { chunk, normalizar, paraTvItem, type TvItem } from './tvUi';

/**
 * TvSearchPage — busca por controle remoto.
 *
 * Duas formas de digitar, ambas sem toque na tela:
 *  1. TECLADO VIRTUAL na tela (navegável com ← → ↑ ↓ e OK) — funciona em
 *     qualquer TV Box, sem depender do teclado do sistema.
 *  2. TECLADO FÍSICO / do controle com teclado, digitando direto no campo.
 *
 * A busca roda sobre o MESMO catálogo do site/Mobile (useMovies) e usa a mesma
 * normalização (sem acentos, minúsculo).
 */

const LINHAS: string[][] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ' ', '⌫', 'LIMPAR'],
];

const POR_BLOCO = 60;

export function TvSearchPage() {
  const navigate = useNavigate();
  const movies = useMovies();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const todos = useMemo<TvItem[]>(
    () => (movies.data ?? []).map(paraTvItem),
    [movies.data],
  );

  const resultados = useMemo(() => {
    const q = normalizar(query);
    if (!q) return [];
    return todos.filter((m) => normalizar(m.title).includes(q));
  }, [todos, query]);

  const visiveis = useMemo(() => chunk(resultados, POR_BLOCO)[0] ?? [], [resultados]);

  const digitar = (k: string) => {
    if (k === '⌫') {
      setQuery((q) => q.slice(0, -1));
      return;
    }
    if (k === 'LIMPAR') {
      setQuery('');
      return;
    }
    // Digitação pelo teclado NA TELA: o campo pode não ser o dono do foco no
    // momento (as teclas estão focadas). Escrevemos sempre no FIM do texto,
    // nunca por interpolação do cursor — assim o que o usuário vê no campo é
    // sempre o que foi digitado, sem "pular" caracteres.
    setQuery((q) => (q + k).slice(0, 60));
  };

  /**
   * Devolve o foco ao CAMPO depois de digitar pelo teclado da tela.
   *
   * Feito dentro do clique (gesto do usuário) e SEM blur: numa TV Box o foco
   * programático no campo é o que mantém o teclado do sistema vivo, e tirar o
   * foco aqui faria o usuário perder o campo no meio da digitação — o bug
   * relatado ("coloco o e-mail e ele sai").
   */
  const focarCampo = () => {
    const campo = inputRef.current;
    if (!campo) return;
    try {
      campo.focus({ preventScroll: true });
      const fim = campo.value.length;
      campo.setSelectionRange(fim, fim);
    } catch {
      /* ignora */
    }
  };

  const abrir = (item: TvItem) => navigate(`/tv/titulo/${item.id}`);

  return (
    <div className="tv-page">
      <h1 className="tv-page-title">Buscar</h1>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Digite o nome do filme ou série..."
        className="tv-search-input"
        data-tv-focusable
        data-tv-initial-focus
        tabIndex={0}
        aria-label="Campo de busca"
      />

      <div className="tv-keyboard">
        {LINHAS.map((linha, li) => (
          <div key={li} className="tv-keyboard-row">
            {linha.map((k) => (
              <button
                key={k}
                data-tv-focusable
                tabIndex={0}
                className={cn('tv-key', k === ' ' && 'tv-key-space', (k === '⌫' || k === 'LIMPAR') && 'tv-key-fn')}
                onClick={() => {
                  digitar(k);
                  // O foco volta ao CAMPO a cada tecla (sem blur): o usuário vê
                  // o texto entrando, as setas ← → movem o cursor, e a TV Box
                  // mantém o teclado do sistema vivo.
                  if (k !== '⌫' && k !== 'LIMPAR') focarCampo();
                }}
              >
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="tv-search-hint">
        Navegue com ← → ↑ ↓ e pressione OK para digitar — o texto entra no campo enquanto você usa o teclado na tela.
      </div>

      <div className="tv-load-more">
        <button
          data-tv-focusable
          tabIndex={0}
          className="tv-btn tv-btn-primary"
          onClick={focarCampo}
        >
          Focar o campo de busca
        </button>
      </div>

      {query.trim() ? (
        resultados.length === 0 ? (
          <div className="tv-error tv-error-muted">
            <h2>Nada encontrado</h2>
            <p>Nenhum título com “{query}”.</p>
          </div>
        ) : (
          <>
            <p className="tv-search-hint">
              {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}
              {resultados.length > POR_BLOCO ? ` — mostrando os ${POR_BLOCO} primeiros` : ''}
            </p>
            <div className="tv-grid">
              {visiveis.map((item) => (
                <TvPosterCard key={`${item.type}-${item.id}`} item={item} onAbrir={abrir} />
              ))}
            </div>
          </>
        )
      ) : (
        <div className="tv-error tv-error-muted">
          <h2>Busque pelo título</h2>
          <p>Ex.: “Avatar”, “Vingadores”, “Stranger Things”...</p>
        </div>
      )}
    </div>
  );
}
