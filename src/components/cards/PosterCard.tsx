import { Link } from "react-router-dom";
import { Play, Mic2, Heart } from "lucide-react";

import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";
import { useFavoriteByMovieId } from "@/hooks/useFavorite";

interface MovieCardProps {
  title: any;
  className?: string;
  forceType?: "movie" | "tv";
  mediaType?: "movie" | "tv";
  /** Progresso de reprodução (0-100) para exibir a barra de "Continuar assistindo". */
  progress?: number;
}

export function PosterCard({
  title,
  className,
  forceType,
  mediaType = "movie",
  progress,
}: MovieCardProps) {
  const tipo = title?.type === "series" || title?.type === "tv" ? "tv" : "movie";
  const linkType = forceType || (tipo === "tv" ? "tv" : "movie");
  const ano = title?.year ? String(title.year) : "";

  // Botão de favorito (corazón) en los cards del catálogo.
  const { user } = useAuth();
  const movieId = title?.id ? String(title.id) : null;
  const fav = useFavoriteByMovieId(movieId ?? "", linkType);

  return (
    <Link
      to={`/titulo/${linkType}/${title.id}`}
      aria-label={title?.title}
      data-tv-card
      className={cn(
        "group flex w-full flex-col rounded-xl focus:outline-none",
        className
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900 shadow-md shadow-black/30 ring-1 ring-white/5 transition duration-300 lg:group-hover:ring-white/20">
        <img
          src={title?.poster_url}
          alt={title?.title}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
          className="h-full w-full object-cover transition duration-300 lg:group-hover:scale-105"
        />

        {/* Badge superior esquerdo: Dublado pt-BR */}
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white shadow sm:left-2 sm:top-2 sm:px-2 sm:py-1 sm:text-[10px]">
          <Mic2 className="h-2.5 w-2.5" />
          Dublado pt-BR
        </span>

        {/* Badge superior direito: ano */}
        {ano && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur sm:right-2 sm:top-2 sm:px-2 sm:py-1 sm:text-[10px]">
            {ano}
          </span>
        )}

        {/* Botón de favorito (corazón) */}
        {movieId && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!user) {
                window.location.hash = "#/login";
                return;
              }
              fav.toggle();
            }}
            aria-label={fav.isFavorite ? "Remover de favoritos" : "Adicionar a favoritos"}
            title={fav.isFavorite ? "Remover de favoritos" : "Adicionar a favoritos"}
            className={cn(
              "absolute bottom-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full transition sm:bottom-2 sm:right-2 sm:h-8 sm:w-8",
              fav.isFavorite
                ? "bg-red-600 text-white shadow-lg"
                : "bg-black/60 text-white/80 backdrop-blur hover:bg-red-600/80 hover:text-white",
            )}
          >
            <Heart
              className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", fav.isFavorite && "fill-current")}
            />
          </button>
        )}

        {/* Série: indicador */}
        {tipo === "tv" && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur sm:bottom-2 sm:left-2 sm:px-2 sm:py-1 sm:text-[10px]">
            Série
          </span>
        )}

        <div className="pointer-events-none absolute inset-0 flex items-end justify-start bg-gradient-to-t from-black/70 via-black/5 to-transparent p-1.5 opacity-100 transition duration-300 sm:p-2 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition group-hover:scale-110 sm:h-8 sm:w-8">
            <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />
          </span>
        </div>

        {typeof progress === "number" && progress > 0 && progress < 100 && (
          <div className="absolute inset-x-0 bottom-0 h-1 w-full bg-black/60">
            <div
              className="h-full bg-brand-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>

      <div className="pt-2">
        <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-white sm:text-sm">
          {title?.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-zinc-400 sm:text-xs">
          {[ano, title?.category?.split(",")?.[0]?.trim()].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

export function PosterCardSkeleton() {
  return (
    <div className="flex w-full animate-pulse flex-col">
      <div className="aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-800" />

      <div className="space-y-2 pt-2">
        <div className="h-3.5 w-3/4 rounded bg-zinc-800" />
        <div className="h-3 w-1/2 rounded bg-zinc-800" />
      </div>
    </div>
  );
}