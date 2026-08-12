import { useEffect, useState } from 'react';
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

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
  progress: propProgress,
}: MovieCardProps) {
  const { user } = useAuth();
  const [progress, setProgress] = useState<number | undefined>(propProgress);

  // Se não recebeu progresso via prop, busca do Supabase
  useEffect(() => {
    if (propProgress !== undefined || !user || !title?.id) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('watch_history')
        .select('position_seconds, duration_seconds')
        .eq('user_id', user.id)
        .eq('movie_id', title.id)
        .maybeSingle();
      if (!cancelled && data && data.duration_seconds > 0) {
        const pct = Math.min(100, Math.round((data.position_seconds / data.duration_seconds) * 100));
        setProgress(pct > 2 && pct < 95 ? pct : undefined);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, title?.id, propProgress]);

  return (
    <Link
      to={`/titulo/${forceType || mediaType}/${title.id}`}
      aria-label={title?.title}
      className={cn(
        "group flex w-full flex-col rounded-xl focus:outline-none",
        className
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900">
        <img
          src={title?.poster_url}
          alt={title?.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 lg:group-hover:scale-105"
        />

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
          {title?.year}
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
