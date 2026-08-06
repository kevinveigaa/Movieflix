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
    <div className={cn("group relative overflow-hidden rounded-xl bg-zinc-900", className)}>
      <img
        src={title?.poster_url}
        alt={title?.title}
        className="aspect-[2/3] w-full object-cover transition duration-300 group-hover:scale-105"
      />

      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/90 via-transparent opacity-0 transition group-hover:opacity-100">
        <div className="flex w-full justify-between p-3">

          <Link
            to={`/titulo/${forceType || mediaType}/${title.id}`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black"
          >
            <Play size={20} fill="currentColor" />
          </Link>

          <button
            
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white"
          >
            
          </button>

        </div>
      </div>

      <div className="p-3">
        <h3 className="truncate text-sm font-semibold text-white">
          {title?.title}
        </h3>

        <p className="text-xs text-zinc-400">
          {title?.year}
        </p>
      </div>
    </div>
  );
}

export function PosterCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl bg-zinc-900">
      <div className="aspect-[2/3] w-full bg-zinc-800" />

      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 rounded bg-zinc-800" />
        <div className="h-3 w-1/2 rounded bg-zinc-800" />
      </div>
    </div>
  );
}









