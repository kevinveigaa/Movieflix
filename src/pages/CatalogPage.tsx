import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PosterCard } from '@/components/cards/PosterCard';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { useMovies } from '@/hooks/useMovies';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { temProgressoReal } from '@/lib/watchProgress';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useAuth } from '@/context/AuthContext';
import { ehInfantil, isCategoriaKids, temCategoria, categoriasDoFilme, ordenarCategorias } from '@/lib/categorias';
import { ehSerie } from '@/lib/media';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Calendar, Shuffle, Star, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { criarSemente, embaralharPriorizandoRecentes } from '@/lib/ordenacaoAleatoria';

type CatalogKind = 'filmes' | 'series';

const TITLES: Record<CatalogKind, string> = {
  filmes: 'Filmes',
  series: 'Séries',
};

const TIPOS: Record<CatalogKind, string[]> = {
  filmes: ['movie'],
  series: ['series', 'serie', 'tv'],
};

type Ordenacao = 'mistura' | 'recentes' | 'antigos' | 'populares' | 'nota' | 'az' | 'za';

type FiltroAudio = 'todos' | 'dublado' | 'legendado';

const ORDENACOES: { id: Ordenacao; label: string }[] = [
  // Apresentação PADRÃO: mistura aleatória com prioridade para os lançamentos.
  { id: 'mistura', label: 'Novidades (mistura)' },
  { id: 'recentes', label: 'Mais recentes' },
  { id: 'antigos', label: 'Mais antigos' },
  { id: 'populares', label: 'Mais populares' },
  { id: 'nota', label: 'Melhor avaliados' },
  { id: 'az', label: 'A–Z' },
  { id: 'za', label: 'Z–A' },
];

export function CatalogPage({ kind }: { kind: CatalogKind }) {
  const movies = useMovies();
  const history = useWatchHistory();
  const { seriesHidden } = useSeriesHidden();
  const { activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;
  const [search, setSearch] = useState('');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('mistura');
  const [filtroAudio, setFiltroAudio] = useState<FiltroAudio>('todos');
  // Semente criada uma vez por montagem da página (ordem estável entre
  // re-renders, recalculada ao recarregar/voltar para o catálogo).
  const [semente] = useState(() => criarSemente());
  // Carregamento progressivo: catálogo é GRANDE (~4.000 filmes / ~1.250 séries).
  // Renderizamos em blocos de 60 e o usuário clica "Carregar mais" (evita travar
  // o navegador/TV renderizando milhares de cards de uma vez).
  const [limite, setLimite] = useState(60);
  const [searchParams, setSearchParams] = useSearchParams();
  const categoria = searchParams.get('categoria');

  // Mapa movie_id → % assistido para a barra de progresso nos cards.
  // Só entra no mapa quem tem progresso REAL (>= 10 min ou >= 30% da duração):
  // títulos nunca assistidos não exibem barra em lugar nenhum.
  const progressByMovie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const h of history.data ?? []) {
      if (!h.movie_id) continue;
      if (!temProgressoReal(h.position_seconds, h.duration_seconds)) continue;
      const pct = h.duration_seconds ? Math.min(100, (h.position_seconds / h.duration_seconds) * 100) : 0;
      map[h.movie_id] = pct;
    }
    return map;
  }, [history.data]);

  // Lista base do tipo (filmes ou séries).
  const base = useMemo(() => {
    return (movies.data ?? []).filter((movie: any) => {
      if (isKid && !ehInfantil(movie)) return false;
      if (seriesHidden && ehSerie(movie)) return false;
      const tipo = String(movie.type ?? 'movie').toLowerCase();
      return TIPOS[kind].includes(tipo);
    });
  }, [movies.data, kind, isKid, seriesHidden]);

  // Categorias presentes no catálogo do tipo (para o filtro de gênero).
  const categoriasDisponiveis = useMemo(() => {
    const nomes = new Set<string>();
    for (const movie of base) {
      for (const cat of categoriasDoFilme(movie)) {
        if (cat !== 'Outros') nomes.add(cat);
      }
    }
    return ordenarCategorias(Array.from(nomes));
  }, [base]);

  // Aplica busca + filtro de categoria + ordenação.
  const results = useMemo(() => {
    const termo = search.trim().toLowerCase();

    let lista = base.filter((movie: any) => {
      const tituloOk = !termo || String(movie.title ?? '').toLowerCase().includes(termo);
      if (!tituloOk) return false;
      if (categoria) {
        return isCategoriaKids(categoria) ? ehInfantil(movie) : temCategoria(movie, categoria);
      }
      // Filtro de áudio (dados reais: dublado_ptbr / language).
      if (filtroAudio === 'dublado') {
        const dublado = movie?.dublado_ptbr === true || /dublado/i.test(String(movie?.language ?? ''));
        if (!dublado) return false;
      } else if (filtroAudio === 'legendado') {
        const dublado = movie?.dublado_ptbr === true || /dublado/i.test(String(movie?.language ?? ''));
        if (dublado) return false;
      }
      return true;
    });

    const ano = (m: any) => Number(m.year ?? 0);
    const nota = (m: any) => Number(m.vote_average ?? 0);
    const popularidade = (m: any) => Number(m.popularity ?? 0);
    // Data de lançamento completa (release_date) com fallback para o ano:
    // ordena corretamente títulos do mesmo ano (pedido do dono).
    const dataLancamento = (m: any) => String(m.release_date ?? m.year ?? '');
    const titulo = (m: any) => String(m.title ?? '');

    switch (ordenacao) {
      case 'mistura':
        // Aleatório com peso para os lançamentos (não altera a categoria/gênero
        // filtrado nem os dados: muda somente a ordem de apresentação).
        lista = embaralharPriorizandoRecentes(lista, semente);
        break;
      case 'recentes':
        lista = [...lista].sort((a: any, b: any) => dataLancamento(b).localeCompare(dataLancamento(a)));
        break;
      case 'antigos':
        lista = [...lista].sort((a: any, b: any) => dataLancamento(a).localeCompare(dataLancamento(b)));
        break;
      case 'populares':
        lista = [...lista].sort((a: any, b: any) => popularidade(b) - popularidade(a));
        break;
      case 'az':
        lista = [...lista].sort((a: any, b: any) => titulo(a).localeCompare(titulo(b), 'pt-BR'));
        break;
      case 'za':
        lista = [...lista].sort((a: any, b: any) => titulo(b).localeCompare(titulo(a), 'pt-BR'));
        break;
      case 'nota':
        lista = [...lista].sort((a: any, b: any) => nota(b) - nota(a));
        break;
    }

    return lista;
  }, [base, search, categoria, ordenacao, semente, filtroAudio]);

  // Total REAL do tipo (filmes ou séries) — independe da busca/filtro ativo.
  const totalTipo = base.length;
  // Bloco visível: busca/filtro/ordenação reseta o carregamento progressivo.
  const visiveis = useMemo(() => results.slice(0, limite), [results, limite]);
  // Paginação/ordenação muda → volta ao início da lista.
  const mudouFiltro = useMemo(
    () => `${search}|${categoria}|${ordenacao}|${filtroAudio}`,
    [search, categoria, ordenacao, filtroAudio],
  );
  const ultimoFiltro = useRef(mudouFiltro);
  if (ultimoFiltro.current !== mudouFiltro) {
    ultimoFiltro.current = mudouFiltro;
    setLimite(60);
  }

  const selecionarCategoria = (nome: string | null) => {
    if (!nome) setSearchParams({}, { replace: true });
    else setSearchParams({ categoria: nome }, { replace: true });
  };

  return (
    <div className="container-app pt-24 pb-16">
      <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl text-white mb-1">
        {categoria || TITLES[kind]}
      </h1>
      <p className="mb-6 text-sm text-ink-400">
        {totalTipo} {kind === 'filmes' ? (totalTipo === 1 ? 'filme disponível' : 'filmes disponíveis') : totalTipo === 1 ? 'série disponível' : 'séries disponíveis'}
        {search.trim() ? ` · ${results.length} resultado(s) para "${search.trim()}"` : ''}
        {' '}· Dublado em pt-BR · Sem anúncios
      </p>

      {/* Busca + ordenação */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          placeholder={`Buscar em ${TITLES[kind].toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-md rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2.5 text-sm text-white placeholder:text-zinc-400 outline-none focus:border-roxo-500"
        />
        <div className="flex flex-wrap items-center gap-2">
          {ORDENACOES.map((o) => (
            <button
              key={o.id}
              onClick={() => setOrdenacao(o.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                ordenacao === o.id
                  ? 'border-roxo-500/60 bg-roxo-500/15 text-roxo-200'
                  : 'border-white/10 bg-white/5 text-ink-300 hover:text-white',
              )}
            >
              {o.id === 'mistura' && <Shuffle className="h-3 w-3" />}
              {o.id === 'recentes' && <Calendar className="h-3 w-3" />}
              {o.id === 'antigos' && <ArrowUpNarrowWide className="h-3 w-3" />}
              {o.id === 'populares' && <TrendingUp className="h-3 w-3" />}
              {o.id === 'az' && <ArrowDownWideNarrow className="h-3 w-3" />}
              {o.id === 'nota' && <Star className="h-3 w-3" />}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtro por categoria/gênero */}
      {categoriasDisponiveis.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => selecionarCategoria(null)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition',
              !categoria ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-ink-300 hover:text-white',
            )}
          >
            Todas
          </button>
          {categoriasDisponiveis.map((c) => (
            <button
              key={c}
              onClick={() => selecionarCategoria(c === categoria ? null : c)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                c === categoria
                  ? 'border-roxo-500/60 bg-roxo-500/15 text-roxo-200'
                  : 'border-white/10 bg-white/5 text-ink-300 hover:text-white',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Filtro de áudio: Todos / Dublado PT-BR / Legendado */}
      <div className="mb-8 flex flex-wrap gap-2">
        {([
          { id: 'todos', label: 'Todos' },
          { id: 'dublado', label: 'Dublado PT-BR' },
          { id: 'legendado', label: 'Legendado' },
        ] as { id: FiltroAudio; label: string }[]).map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroAudio(f.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition',
              filtroAudio === f.id
                ? 'border-roxo-500/60 bg-roxo-500/15 text-roxo-200'
                : 'border-white/10 bg-white/5 text-ink-300 hover:text-white',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {movies.isLoading ? (
        <FullScreenLoader label="Carregando catálogo..." />
      ) : visiveis.length === 0 ? (
        <p className="text-ink-400">Nenhum título encontrado por aqui ainda.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {visiveis.map((movie: any) => (
              <PosterCard key={movie.id} title={movie} className="w-full" progress={progressByMovie[movie.id]} />
            ))}
          </div>
          {results.length > limite && (
            <div className="mt-10 flex justify-center">
              <button
                data-tv-focusable
                onClick={() => setLimite((l) => l + 60)}
                className="rounded-full border border-roxo-500/60 bg-roxo-500/15 px-6 py-2.5 text-sm font-semibold text-roxo-200 transition hover:bg-roxo-500/25 hover:text-white"              >
                Carregar mais ({results.length - limite} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}