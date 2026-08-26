import { useMemo, useRef, useState, useEffect } from "react";
import { PosterCard, PosterCardSkeleton } from "@/components/cards/PosterCard";
import { HeroBanner, HeroBannerSkeleton } from "@/components/home/HeroBanner";
import { useMovies } from "@/hooks/useMovies";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";
import { useSeriesHidden } from "@/hooks/useSeriesHidden";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { Crown, Sparkles, ChevronLeft, ChevronRight, Search as SearchIcon, X } from "lucide-react";
import { categoriasDoFilme, ehInfantil, ordenarCategorias } from "@/lib/categorias";
import { ehFilme } from "@/lib/media";

export function HomePage() {
  const { subscription, activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;
  const movies = useMovies();
  const { seriesHidden } = useSeriesHidden();

  const visibleMovies = useMemo(() => {
    let lista = movies.data ?? [];
    if (seriesHidden) lista = lista.filter(ehFilme);
    if (isKid) lista = lista.filter(ehInfantil);
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies.data, isKid, seriesHidden]);

  // Busca automática na HOME: filtra o catálogo enquanto digita (debounce
  // 250ms), com busca fuzzy tolerante a erros e busca por ano/número.
  const { termo, setTermo, results, resultsFallback, temBusca } = useFuzzySearch(visibleMovies, "");
  const buscaResultados = results.length > 0 ? results : resultsFallback;

  const destaques = useMemo(() => visibleMovies.slice(0, 5), [visibleMovies]);

  const categorias = useMemo(() => {
    const mapa = new Map<string, any[]>();

    for (const movie of visibleMovies) {
      for (const cat of categoriasDoFilme(movie)) {
        if (!mapa.has(cat)) mapa.set(cat, []);
        mapa.get(cat)!.push(movie);
      }
    }

    const nomes = ordenarCategorias(Array.from(mapa.keys()));

    return nomes
      .map((nome) => ({ nome, lista: mapa.get(nome)!.slice(0, 20) }))
      .filter((c) => c.lista.length > 0);
  }, [visibleMovies]);

  const recentes = useMemo(() => visibleMovies.slice(0, 5), [visibleMovies]);

  // "Em alta" (tendencias): los mejor valorados del catálogo.
  const emAlta = useMemo(() => {
    return [...visibleMovies]
      .sort((a: any, b: any) => Number(b.vote_average ?? 0) - Number(a.vote_average ?? 0))
      .slice(0, 20);
  }, [visibleMovies]);

  // "Populares": mejor valorados con prioridad a los más recientes entre ellos.
  const populares = useMemo(() => {
    return [...visibleMovies]
      .sort((a: any, b: any) => {
        const nota = Number(b.vote_average ?? 0) - Number(a.vote_average ?? 0);
        if (nota !== 0) return nota;
        return Number(b.year ?? 0) - Number(a.year ?? 0);
      })
      .slice(0, 20);
  }, [visibleMovies]);

  return (
    <div className="pb-16">
      <div className="container-app">
        {movies.isLoading ? <HeroBannerSkeleton /> : <HeroBanner items={destaques} />}
      </div>

      <div className="container-app space-y-10 pt-8">
        {!hasActiveSubscription(subscription) && <UpgradeBanner />}

        {/* Busca automática na HOME */}
        <div className="relative mx-auto max-w-2xl">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={seriesHidden ? "Busque filmes por nome, ano..." : "Busque filmes e séries por nome, ano..."}
            className="w-full rounded-full border border-white/10 bg-ink-800/70 py-3.5 pl-12 pr-12 text-base text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
          />
          {termo && (
            <button
              onClick={() => setTermo("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
              aria-label="Limpar busca"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {temBusca ? (
          <div className="space-y-10">
            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="truncate text-lg font-bold text-white sm:text-xl lg:text-2xl">
                  Resultados para &ldquo;{termo}&rdquo;
                </h2>
                <Link
                  to={`/pesquisa?q=${encodeURIComponent(termo.trim())}`}
                  data-tv-focusable
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 transition hover:bg-white/15 hover:text-white sm:text-sm"
                >
                  Ver todos
                </Link>
              </div>

              {buscaResultados.length === 0 ? (
                <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 text-center text-ink-400">
                  <SearchIcon className="h-10 w-10 opacity-50" />
                  <p>
                    Nenhum título encontrado para <span className="text-white">{termo}</span>.
                  </p>
                  <p className="text-sm">Verifique a ortografia ou tente por ano/gênero.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 xs:grid-cols-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                  {buscaResultados.map((m: any) => (
                    <PosterCard key={m.id} title={m} className="w-full" />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {movies.isLoading && <CategoryRowSkeleton />}

            {!movies.isLoading && (
              <>
                {emAlta.length > 0 && (
                  <CategoryRow title="Em alta" items={emAlta} />
                )}
                {populares.length > 0 && (
                  <CategoryRow title="Populares" items={populares} />
                )}
                {recentes.length > 0 && (
                  <CategoryRow title="Adicionados recentemente" items={recentes} />
                )}
                {categorias.map((cat) => (
                  <CategoryRow
                    key={cat.nome}
                    title={cat.nome}
                    items={cat.lista}
                    category={cat.nome}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Linha de categoria com setas ---------- */

function CategoryRow({
  title,
  items,
  category,
  progressMap,
  verMaisTo: verMaisToProp,
}: {
  title: string;
  items: any[];
  category?: string;
  /** Progresso de reprodução (0-100) para exibir a barra de progresso. */
  progressMap?: Record<string, number>;
  /** Destino do botão "Ver mais" da categoria. Default: catálogo da categoria. */
  verMaisTo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // "Ver mais" de uma categoria leva à página de catálogo filtrando por ela;
  // uma obra aparece em todas as categorias a que foi atribuída.
  const verMaisTo = verMaisToProp ?? (category ? `/filmes?categoria=${encodeURIComponent(category)}` : "/filmes");

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items.length]);

  const scroll = (dir: "left" | "right") => {
    const el = ref.current;
    if (!el) return;
    const amount = el.clientWidth;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="group/row relative" data-tv-row>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="truncate text-lg font-bold text-white sm:text-xl lg:text-2xl">{title}</h2>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={verMaisTo}
            data-tv-focusable
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 transition hover:bg-white/15 hover:text-white sm:text-sm"
          >
            Ver mais
          </Link>

          <button
            type="button"
            onClick={() => scroll("left")}
            disabled={!canLeft}
            aria-label="Anterior"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-200 transition hover:bg-white/15 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => scroll("right")}
            disabled={!canRight}
            aria-label="Próximo"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-200 transition hover:bg-white/15 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        {canLeft && (
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Anterior"
            className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover/row:opacity-100 hover:bg-black sm:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {canRight && (
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Próximo"
            className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover/row:opacity-100 hover:bg-black sm:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <div
          ref={ref}
          data-tv-scroller
          className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-4 sm:gap-4 md:gap-4 lg:gap-5"
        >
          {items.map((movie) => (
            <div
              key={movie.id}
              className="shrink-0 snap-start basis-[calc((100%-1.5rem)/3)] sm:basis-[calc((100%-3rem)/4)] md:basis-[calc((100%-4rem)/5)] lg:basis-[calc((100%-5rem)/6)]"
            >
              <PosterCard
                title={{
                  id: movie.id,
                  title: movie.title,
                  description: movie.description,
                  poster_url: movie.poster_url,
                  quality: movie.quality ?? "HD",
                  type: movie.type ?? "movie",
                }}
                progress={progressMap?.[movie.id]}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryRowSkeleton() {
  return (
    <div className="space-y-10">
      {[0, 1, 2].map((row) => (
        <section key={row}>
          <div className="mb-4 h-6 w-40 animate-pulse rounded bg-white/10" />
          <div className="flex gap-3 sm:gap-4 lg:gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="shrink-0 basis-[calc((100%-1.5rem)/3)] sm:basis-[calc((100%-3rem)/4)] md:basis-[calc((100%-4rem)/5)] lg:basis-[calc((100%-5rem)/6)]"
              >
                <PosterCardSkeleton />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- Banner de upgrade ---------- */

function UpgradeBanner() {
  return (
    <Link
      to="/minha-assinatura"
      className="flex items-center gap-4 rounded-2xl border border-roxo-600/30 bg-gradient-to-r from-brand-700 via-roxo-800 to-black p-5"
    >
      <div className="rounded-xl bg-brand-600 p-3">
        <Crown />
      </div>

      <div>
        <h3 className="flex gap-2 font-bold text-white">
          <Sparkles />
          Desbloqueie todo conteúdo
        </h3>
        <p className="text-gray-400">Assine e assista sem limites</p>
      </div>
    </Link>
  );
}