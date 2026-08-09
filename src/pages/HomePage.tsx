import { useRef, useState, useEffect } from "react";
import { PosterCard, PosterCardSkeleton } from "@/components/cards/PosterCard";
import { useMovies } from "@/hooks/useMovies";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { Crown, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

export function HomePage() {
  const { subscription } = useAuth();
  const movies = useMovies("movie");

  const getMainCategory = (movie: any) => {
    const categories = movie.category?.split(",").map((c: string) => c.trim()) || [];

    if (categories.includes("Ação")) return "Ação";
    if (categories.includes("Terror")) return "Terror";
    if (categories.includes("Comédia")) return "Comédia";
    if (categories.includes("Drama")) return "Drama";
    if (categories.includes("Ficção Científica")) return "Ficção Científica";

    return categories[0] || "Outros";
  };

  const categorias = [
    { nome: "Filmes em destaque", lista: movies.data?.slice(0, 20) },
    { nome: "Ação", lista: movies.data?.filter((m) => getMainCategory(m) === "Ação").slice(0, 20) },
    { nome: "Aventura", lista: movies.data?.filter((m) => getMainCategory(m) === "Aventura").slice(0, 20) },
    { nome: "Ficção Científica", lista: movies.data?.filter((m) => getMainCategory(m) === "Ficção Científica").slice(0, 20) },
    { nome: "Terror", lista: movies.data?.filter((m) => getMainCategory(m) === "Terror").slice(0, 20) },
    { nome: "Comédia", lista: movies.data?.filter((m) => getMainCategory(m) === "Comédia").slice(0, 20) },
  ];

  return (
    <div className="container-app pt-8 pb-16 space-y-10">
      {!hasActiveSubscription(subscription) && <UpgradeBanner />}

      {movies.isLoading && <CategoryRowSkeleton />}

      {!movies.isLoading &&
        categorias
          .filter((cat) => cat.lista?.length)
          .map((cat) => <CategoryRow key={cat.nome} title={cat.nome} items={cat.lista ?? []} />)}
    </div>
  );
}

/* ---------- Linha de categoria com setas ---------- */

function CategoryRow({ title, items }: { title: string; items: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

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
    // rola exatamente uma "página" (os itens visíveis)
    const amount = el.clientWidth;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="group/row relative">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="truncate text-lg font-bold text-white sm:text-xl lg:text-2xl">{title}</h2>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/filmes"
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
        {/* seta flutuante esquerda */}
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

        {/* seta flutuante direita */}
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

/* ---------- Banner de upgrade (inalterado) ---------- */

function UpgradeBanner() {
  return (
    <Link
      to="/minha-assinatura"
      className="flex items-center gap-4 rounded-2xl border border-purple-600/30 bg-gradient-to-r from-purple-900 to-black p-5"
    >
      <div className="rounded-xl bg-purple-600 p-3">
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
