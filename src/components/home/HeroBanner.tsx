import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Info, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatTime } from "@/lib/timeFormat";

const INTERVALO = 5000;

export interface HeroItem {
  id: string | number;
  title?: string;
  description?: string;
  backdrop_url?: string;
  poster_url?: string;
  quality?: string;
  language?: string;
  category?: string;
  type?: string;
}

export function HeroBanner({ items }: { items: HeroItem[] }) {
  const slides = items.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [heroProgress, setHeroProgress] = useState<{pos: number; dur: number} | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { user } = useAuth();

  // Busca progresso do slide atual
  useEffect(() => {
    if (!user || !slides[index]?.id) { setHeroProgress(null); return; }
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('watch_history')
        .select('position_seconds, duration_seconds')
        .eq('user_id', user.id)
        .eq('movie_id', String(slides[index].id))
        .maybeSingle();
      if (!cancelled && data && data.duration_seconds > 0) {
        const pct = data.position_seconds / data.duration_seconds;
        if (pct >= 0.02 && pct < 0.95) {
          setHeroProgress({ pos: data.position_seconds, dur: data.duration_seconds });
        } else {
          setHeroProgress(null);
        }
      } else {
        setHeroProgress(null);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, index, slides]);

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length]
  );

  const restart = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (slides.length <= 1) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, INTERVALO);
  }, [slides.length]);

  useEffect(() => {
    restart();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [restart]);

  if (!slides.length) return null;

  const atual = slides[index];
  const generos = (atual.category ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <section
      className="relative -mx-4 mb-4 overflow-hidden rounded-none sm:-mx-6 lg:-mx-8 lg:rounded-3xl"
      aria-roledescription="carousel"
      aria-label="Filmes em destaque"
    >
      <div className="relative h-[62vw] max-h-[560px] min-h-[300px] w-full">
        {slides.map((s, i) => (
          <img
            key={s.id}
            src={s.backdrop_url || s.poster_url}
            alt={s.title ?? "Destaque"}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ease-out ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
            loading={i === 0 ? "eager" : "lazy"}
          />
        ))}

        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/90 via-ink-950/40 to-transparent" />

        <div className="absolute inset-0 flex items-end">
          <div className="w-full px-5 pb-8 sm:px-8 sm:pb-10 lg:px-12 lg:pb-14">
            <div className="max-w-2xl space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                <span className="rounded-md bg-brand-600 px-2 py-0.5 font-bold uppercase tracking-wide text-white">
                  Destaque
                </span>
                {atual.quality && <span className="chip">{atual.quality}</span>}
                {atual.language && <span className="chip">{atual.language}</span>}
                {generos.map((g) => (
                  <span key={g} className="chip">
                    {g}
                  </span>
                ))}
              </div>

              <h1 className="text-2xl font-extrabold leading-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl">
                {atual.title}
              </h1>

              {atual.description && (
                <p className="line-clamp-2 max-w-xl text-sm text-gray-300 sm:line-clamp-3 sm:text-base">
                  {atual.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {heroProgress ? (
                  <Link to={`/assistir/${atual.id}?t=${heroProgress.pos}`} className="btn-primary px-6 py-2.5">
                    <Play className="h-4 w-4" fill="currentColor" />
                    Continuar {formatTime(heroProgress.pos)}
                  </Link>
                ) : (
                  <Link to={`/assistir/${atual.id}`} className="btn-primary px-6 py-2.5">
                    <Play className="h-4 w-4" fill="currentColor" />
                    Assistir
                  </Link>
                )}
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

        {slides.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Destaque anterior"
              onClick={() => {
                go(-1);
                restart();
              }}
              className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/80 sm:flex"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="Próximo destaque"
              onClick={() => {
                go(1);
                restart();
              }}
              className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/80 sm:flex"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            <div className="absolute bottom-3 right-4 flex items-center gap-2 sm:bottom-5 sm:right-8">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Ir para o destaque ${i + 1}`}
                  onClick={() => {
                    setIndex(i);
                    restart();
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-7 bg-brand-500" : "w-3 bg-white/40 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function HeroBannerSkeleton() {
  return (
    <div className="-mx-4 mb-4 h-[62vw] max-h-[560px] min-h-[300px] animate-pulse bg-ink-800/70 sm:-mx-6 lg:-mx-8 lg:rounded-3xl" />
  );
}
