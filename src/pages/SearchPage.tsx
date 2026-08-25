import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import Fuse from 'fuse.js';
import { PosterCard, PosterCardSkeleton } from '@/components/cards/PosterCard';
import { useMovies } from '@/hooks/useMovies';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useAuth } from '@/context/AuthContext';
import { ehInfantil } from '@/lib/categorias';
import { ehSerie } from '@/lib/media';
import { normalizar } from '@/lib/categorias';

/**
 * Busca inteligente (fuzzy search) com Fuse.js.
 *
 * Aceita escrita parcial ("vingad"), erro de letra ("vingadoes"), palavras
 * invertidas ("ultimato vingadores"), parte do título, título original em
 * inglês ("avengers"), título em pt-BR, gênero ("ação"), ano ("2019") e
 * busca em vários campos ao mesmo tempo. Ordena por RELEVÂNCIA (Fuse score),
 * com empate resolvido pela nota/popularidade.
 *
 * O Fuse é carregado de forma preguiçosa (dynamic import) para não pesar no
 * bundle inicial; a primeira busca faz o load (rápido, ~10kB gzip) e as
 * seguintes usam a instância em cache.
 */
let fusePromise: Promise<typeof Fuse> | null = null;
function carregarFuse(): Promise<typeof Fuse> {
  if (!fusePromise) fusePromise = import('fuse.js').then((m) => m.default ?? m);
  return fusePromise;
}

interface CatalogMovie {
  id: string;
  title?: string | null;
  category?: string | null;
  type?: string | null;
  year?: string | number | null;
  vote_average?: number | null;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const movies = useMovies();
  const { seriesHidden } = useSeriesHidden();
  const { activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim()) setParams({ q: q.trim() }, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [q, setParams]);

  // Busca inteligente no catálogo local com Fuse.js (fuzzy). Os títulos têm
  // URL de vídeo e a página de detalhes/player funciona. A busca antiga no
  // TMDB levava a links quebrados; a busca por "includes" simples não
  // tolerava erro de digitação — o Fuse resolve ambos.
  const [fuse, setFuse] = useState<typeof Fuse | null>(null);
  const [buscaPronta, setBuscaPronta] = useState(false);

  useEffect(() => {
    carregarFuse().then((F) => {
      setFuse(F);
      setBuscaPronta(true);
    });
  }, []);

  const base = useMemo(() => {
    return (movies.data ?? []).filter((m: CatalogMovie) => {
      if (isKid && !ehInfantil(m)) return false;
      if (seriesHidden && ehSerie(m)) return false;
      return true;
    });
  }, [movies.data, isKid, seriesHidden]);

  const results = useMemo(() => {
    const termo = initial.trim();
    if (!termo) return [];
    if (!fuse || !buscaPronta) return [];

    // Campos pesquisados (com pesos): título pt-BR e original têm prioridade,
    // mas ator/diretor/gênero/ano também contam (quando presentes no JSON).
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
    });

    const achados = instancia.search(termo).slice(0, 60);
    // Ordenação por relevância (score) com empate pela nota.
    return achados
      .sort((a: any, b: any) => {
        const s = (a.score ?? 1) - (b.score ?? 1);
        if (Math.abs(s) > 0.0001) return s;
        return Number(b.item.vote_average ?? 0) - Number(a.item.vote_average ?? 0);
      })
      .map((r: any) => r.item as CatalogMovie);
  }, [base, initial, fuse, buscaPronta]);

  // Fallback determinístico (sem Fuse ainda): normaliza acentos e tenta
  // includes em título/categoria/ano — cobre o intervalo até o Fuse carregar.
  const resultsFallback = useMemo(() => {
    if (results.length > 0 || !initial.trim()) return [];
    const termo = normalizar(initial);
    if (!termo) return [];
    return base.filter((m: CatalogMovie) => {
      const titulo = normalizar(String(m.title ?? ''));
      const categorias = normalizar(String(m.category ?? ''));
      const ano = normalizar(String(m.year ?? ''));
      return titulo.includes(termo) || categorias.includes(termo) || ano.includes(termo);
    });
  }, [base, initial, results.length]);

  return (
    <div className="container-app py-8">
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={seriesHidden ? "Busque filmes..." : "Busque filmes e séries..."}
            className="w-full rounded-full border border-white/10 bg-ink-800/70 py-3.5 pl-12 pr-12 text-base text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
              aria-label="Limpar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-8">
        {!initial.trim() ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-ink-400">
            <SearchIcon className="h-10 w-10 opacity-50" />
            <p>Digite para buscar em todo o catálogo.</p>
          </div>
        ) : movies.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {Array.from({ length: 12 }).map((_, i) => (
              <PosterCardSkeleton key={i} />
            ))}
          </div>
        ) : results.length === 0 && resultsFallback.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-ink-400">
            <SearchIcon className="h-10 w-10 opacity-50" />
            <p>Nenhum título encontrado para <span className="text-white">{initial}</span>.</p>
            <p className="text-sm">Verifique a ortografia ou explore as categorias na página inicial.</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-400">
              {(results.length > 0 ? results : resultsFallback).length} {(results.length > 0 ? results : resultsFallback).length === 1 ? 'título' : 'títulos'} para{' '}
              <span className="text-white">{initial}</span>
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {(results.length > 0 ? results : resultsFallback).map((m: CatalogMovie) => (
                <PosterCard key={m.id} title={m} className="w-full" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
