import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';

/**
 * Busca fuzzy compartilhada (SearchPage + HomePage).
 *
 * - Debounce de 250ms: pesquisa enquanto digita, sem precisar de Enter.
 * - Fuse.js importado de forma ESTÁTICA (não lazy): o carregamento dinâmico
 *   causava "Class constructor S cannot be invoked without 'new'" em produção
 *   (interação do dynamic import com o runtime de módulos do Vite).
 * - Tolerante a erros de digitação (threshold 0.42, ignoreLocation) e busca em
 *   vários campos: título pt-BR, título original, gênero, ano (número), elenco
 *   e diretor — "vingadoes", "ultimato vingadores" ou "2019" encontram.
 * - Ordena por relevância (score Fuse) com empate pela nota (vote_average).
 */

export interface FuzzySearchOptions {
  /** Tempo de debounce em ms (default 250). */
  debounceMs?: number;
}

export function useFuzzySearch<T extends Record<string, any>>(
  base: T[],
  termoInicial = '',
  options: FuzzySearchOptions = {},
) {
  const { debounceMs = 250 } = options;

  const [termo, setTermo] = useState(termoInicial);
  const [debounced, setDebounced] = useState(termoInicial);

  // Debounce do termo digitado.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo), debounceMs);
    return () => clearTimeout(t);
  }, [termo, debounceMs]);

  // Instância única de Fuse, criada apenas quando há termo de busca.
  const results = useMemo(() => {
    const q = debounced.trim();
    if (!q) return [];

    const instancia = new Fuse(base as any[], {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'original_title', weight: 0.3 },
        { name: 'original_name', weight: 0.3 },
        { name: 'category', weight: 0.12 },
        { name: 'year', weight: 0.08 },
        { name: 'cast', weight: 0.06 },
        { name: 'director', weight: 0.06 },
        { name: 'genres', weight: 0.06 },
      ],
      threshold: 0.42,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
      useExtendedSearch: false,
      // Ignora diferenças de acentuação ("acao" encontra "Ação").
      ignoreDiacritics: true,
    });

    const achados = instancia.search(q).slice(0, 60);
    return achados
      .sort((a: any, b: any) => {
        const s = (a.score ?? 1) - (b.score ?? 1);
        if (Math.abs(s) > 0.0001) return s;
        return Number(b.item.vote_average ?? 0) - Number(a.item.vote_average ?? 0);
      })
      .map((r: any) => r.item as T);
  }, [base, debounced]);

  // Fallback determinístico (cobre o intervalo de debounce com includes):
  // normaliza acentos e tenta includes em título/categoria/ano.
  const resultsFallback = useMemo(() => {
    if (results.length > 0 || !debounced.trim()) return [];
    const termo = debounced.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!termo) return [];
    return base.filter((m) => {
      const titulo = String(m.title ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const categorias = String(m.category ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const ano = String(m.year ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return titulo.includes(termo) || categorias.includes(termo) || ano.includes(termo);
    });
  }, [base, debounced, results.length]);

  return {
    termo,
    setTermo,
    results,
    resultsFallback,
    temBusca: debounced.trim().length > 0,
    total: results.length > 0 ? results.length : resultsFallback.length,
  };
}
