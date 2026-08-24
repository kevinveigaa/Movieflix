import { useMemo, useRef, useState, useEffect } from "react";
import { PosterCard, PosterCardSkeleton } from "@/components/cards/PosterCard";
import { HeroBanner, HeroBannerSkeleton } from "@/components/home/HeroBanner";
import { useMovies } from "@/hooks/useMovies";
import { useCatalogWatchHistory } from "@/hooks/useWatchHistory";
import { useSeriesHidden } from "@/hooks/useSeriesHidden";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Link } from "react-router-dom";
import { Crown, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { categoriasDoFilme, ehInfantil, ordenarCategorias } from "@/lib/categorias";
import { ehFilme } from "@/lib/media";
import { temProgressoReal, progressoPercentual } from "@/lib/watchProgress";

export function HomePage() {
  const { subscription, activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;
  const movies = useMovies();
  const history = useCatalogWatchHistory();
  const { seriesHidden } = useSeriesHidden();
  const { entitlements } = useEntitlements();

  const visibleMovies = useMemo(() => {
    let lista = movies.data ?? [];
    if (seriesHidden) lista = lista.filter(ehFilme);
    if (isKid) lista = lista.filter(ehInfantil);
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies.data, isKid, seriesHidden]);

  const destaques = useMemo(() => visibleMovies.slice(0, 5), [visibleMovies]);

  // Mapa movie_id → % assistido para a barra de progresso nos cards.
  // Só entra no mapa quem tem progresso REAL (>= 10 min ou >= 30% da duração):
  // títulos nunca assistidos (ou assistidos por menos de 10 min) não exibem
  // barra de progresso em lugar nenhum.
  const progressByMovie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const { history: h, movie } of history.items ?? []) {
      if (!temProgressoReal(h.position_seconds, h.duration_seconds)) continue;
      map[String(movie.id)] = progressoPercentual(h.position_seconds, h.duration_seconds);
    }
    return map;
  }, [history.items]);

  // "Continuar assistindo": apenas títulos visibles (respeta modo infantil),
  // con progreso REAL (>= 10 min o >= 30% de la duración) y que no llegaron al
  // fin (useCatalogWatchHistory ya filtra esto). El límite de títulos guardados
  // depende del plan (maxHistory): Básico 5, Estándar 15, Premium ilimitado.
  const continueWatching = useMemo(() => {
    const visivel = new Set(visibleMovies.map((m) => String(m.id)));
    const limite = Number.isFinite(entitlements.maxHistory) ? entitlements.maxHistory : Infinity;
    return (history.items ?? [])
      .filter(({ movie }) => visivel.has(String(movie.id)))
      .map(({ movie }) => movie)
      .slice(0, limite);
  }, [history.items, visibleMovies, entitlements.maxHistory]);

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

        {movies.isLoading && <CategoryRowSkeleton />}

        {!movies.isLoading && (
          <>
            {continueWatching.length > 0 && (
              <CategoryRow
                title="Continuar assistindo"
                items={continueWatching}
                progressMap={progressByMovie}
                verMaisTo="/continuar"
              />
            )}
            {emAlta.length > 0 && (
              <CategoryRow title="Em alta" items={emAlta} progressMap={progressByMovie} />
            )}
            {populares.length > 0 && (
              <CategoryRow title="Populares" items={populares} progressMap={progressByMovie} />
            )}
            {recentes.length > 0 && (
              <CategoryRow title="Adicionados recentemente" items={recentes} progressMap={progressByMovie} />
            )}
            {categorias.map((cat) => (
              <CategoryRow
                key={cat.nome}
                title={cat.nome}
                items={cat.lista}
                category={cat.nome}
                progressMap={progressByMovie}
              />
            ))}
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
  /** Mapa movie_id → % assistido, para a barra de "Continuar assistindo". */
  progressMap?: Record<string, number>;
  /** Destino do botão "Ver mais" (ex.: /continuar). Default: catálogo da categoria. */
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
      className="flex items-center gap-4 rounded-2xl border border-brand-600/30 bg-gradient-to-r from-brand-700 via-purple-900 to-black p-5"
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