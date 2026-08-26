import { useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';

/**
 * Busca fuzzy compartilhada (SearchPage + HomePage).
 *
 * - Debounce de 250ms: pesquisa enquanto digita, sem precisar de Enter.
 * - Fuse.js carregado de forma preguiçosa (dynamic import) para não pesar no
 *   bundle inicial; a primeira busca faz o load e as seguintes reutilizam.
 * - Tolerante a erros de digitação (threshold 0.42, ignoreLocation) e busca em
 *   vários campos: título pt-BR, título original, gênero, ano (número), elenco
 *   e diretor — "vingadoes", "ultimato vingadores" ou "2019" encontram.
 * - Ordena por relevância (score Fuse) com empate pela nota (vote_average).
 */

let fusePromise: Promise<typeof Fuse> | null = null;
function carregarFuse(): Promise<typeof Fuse> {
  if (!fusePromise) fusePromise = import('fuse.js').then((m) => m.default ?? m);
  return fusePromise;
}

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
  const [fuse, setFuse] = useState<typeof Fuse | null>(null);
  const [buscaPronta, setBuscaPronta] = useState(false);

  // Debounce do termo digitado.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo), debounceMs);
    return () => clearTimeout(t);
  }, [termo, debounceMs]);

  // Carrega o Fuse uma única vez.
  useEffect(() => {
    let ativo = true;
    carregarFuse().then((F) => {
      if (!ativo) return;
      setFuse(F);
      setBuscaPronta(true);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const results = useMemo(() => {
    const q = debounced.trim();
    if (!q || !fuse || !buscaPronta) return [];

    const instancia = new fuse(base as any[], {
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
  }, [base, debounced, fuse, buscaPronta]);

  // Fallback determinístico (sem Fuse ainda carregado): normaliza acentos e
  // tenta includes em título/categoria/ano — cobre o intervalo inicial.
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

  const ref = useRef({ setTermo });
  ref.current.setTermo = setTermo;

  return {
    termo,
    setTermo,
    results,
    resultsFallback,
    buscaPronta,
    temBusca: debounced.trim().length > 0,
    total: results.length > 0 ? results.length : resultsFallback.length,
  };
}
