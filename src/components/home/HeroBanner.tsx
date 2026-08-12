import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Play, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface HeroItem {
  id: string;
  title: string;
  description: string;
  backdrop_url: string;
  poster_url: string;
  type: "movie" | "series";
}

export function HeroBanner({ items }: { items: HeroItem[] }) {
  const slides = items.slice(0, 5);
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = (dir: number) => {
    setIndex((i) => (i + dir + slides.length) % slides.length);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
  };

  const atual = slides[index];
  if (!atual) return null;

  return (
    <div className="relative isolate w-full overflow-hidden bg-black">
      {/* Imagem de fundo */}
      <div className="relative aspect-[16/9] w-full sm:aspect-[21/9] lg:aspect-[2.35/1]">
        <img
          src={atual.backdrop_url}
          alt={atual.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />
      </div>

      {/* Conteúdo */}
      <div className="absolute inset-0 flex items-end">
        <div className="container-app w-full pb-8 pt-20 sm:pb-12 sm:pt-24 lg:pb-16">
          <div className="max-w-2xl space-y-3 sm:space-y-4">
            <h2 className="font-display text-2xl leading-tight tracking-wide text-white sm:text-3xl md:text-4xl lg:text-5xl">
              {atual.title}
            </h2>
            <p className="line-clamp-2 text-sm leading-relaxed text-zinc-300 sm:text-base md:line-clamp-3">
              {atual.description}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link to={`/assistir/${atual.id}`} className="btn-primary px-6 py-2.5">
                <Play className="h-4 w-4" fill="currentColor" />
                Assistir
              </Link>
              <Link
                to={`/titulo/${atual.type === "series" ? "tv" : "movie"}/${atual.id}`}
                className="btn-ghost px-6 py-2.5"
              >
                <Info className="h-4 w-4" />
                Mais informações
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Setas */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 sm:left-4 sm:p-3"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 sm:right-4 sm:p-3"
            aria-label="Próximo"
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </>
      )}

      {/* Dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-4">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"
              )}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
