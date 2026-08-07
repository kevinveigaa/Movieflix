import { Link } from "react-router-dom";
import { Play } from "lucide-react";

import { cn } from "@/lib/cn";

interface MovieCardProps {
  title: any;
  className?: string;
  forceType?: "movie" | "tv";
  mediaType?: "movie" | "tv";
}

export function PosterCard({
  title,
  className,
  forceType,
  mediaType = "movie",
}: MovieCardProps) {
  return (
    <div className={cn("group flex w-full flex-col", className)}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900">
        <img
          src={title?.poster_url}
          alt={title?.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 lg:group-hover:scale-105"
        />

        <div className="pointer-events-none absolute inset-0 flex items-end justify-start bg-gradient-to-t from-black/70 via-black/5 to-transparent p-1.5 opacity-100 transition duration-300 sm:p-2 lg:opacity-0 lg:group-hover:opacity-100">
          <Link
            to={`/titulo/${forceType || mediaType}/${title.id}`}
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition hover:scale-110 sm:h-8 sm:w-8"
            aria-label="Assistir"
          >
            <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />
          </Link>
        </div>
      </div>

      <div className="pt-2">
        <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-white sm:text-sm">
          {title?.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-zinc-400 sm:text-xs">
          {title?.year}
        </p>
      </div>
    </div>
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
