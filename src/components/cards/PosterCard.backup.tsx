import { Link } from "react-router-dom";
import { Play, Plus, Check, Heart } from "lucide-react";
import { useToggleFavoriteByTitle } from "@/hooks/useFavorite";
import { cn } from "@/lib/cn";
import { useFavorite } from "@/hooks/useFavorite";

interface MovieCardProps {
  title: any;
  className?: string;
  forceType?: "movie" | "tv";
}

export function PosterCard({ title, className, forceType }: MovieCardProps) {

  const { mutate: toggleFavorite } = useToggleFavoriteByTitle();
  const { isFavorite, toggle } = useFavorite(title.tmdb_id ?? title.id, mediaType);

  return (
    <Link
      to={`/assistir/${title.id}`}
      className={cn(
        "group relative block w-full",
        className
      )}
    >

      <div className="
        relative 
        aspect-[2/3]
        overflow-hidden
        rounded-xl
        bg-zinc-900
        shadow-lg
        transition-all
        duration-300
        hover:-translate-y-2
      ">

        <img
          src={
            title.poster_url
            ? title.poster_url
            : title.poster_path
              ? `https://image.tmdb.org/t/p/w500${title.poster_path}`
              : "/placeholder.jpg"
          }
          alt={title.title}
          loading="lazy"
          className="
            h-full
            w-full
            object-cover
            transition
            duration-500
            group-hover:scale-110
          "
        />

        <div className="
          absolute
          inset-0
          bg-gradient-to-t
          from-black
          via-transparent
          opacity-0
          group-hover:opacity-100
          transition
        "/>


        <div className="
          absolute
          bottom-3
          left-3
          flex
          gap-2
          opacity-0
          group-hover:opacity-100
          transition
        ">

          <span className="
            flex
            h-10
            w-10
            items-center
            justify-center
            rounded-full
            bg-purple-600
            text-white
          ">
            <Play className="h-5 w-5 fill-white"/>
          </span>


          <button
  onClick={(e)=>{
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(title);
  }}
  className={cn(
    "flex h-10 w-10 items-center justify-center rounded-full border transition",
    isFavorite
      ? "bg-purple-600 border-purple-400 text-white"
      : "bg-black/70 border-white/30 text-white"
  )}
>
  {
    isFavorite
      ? <Check size={18}/>
      : <Plus size={18}/>
  }
</button>

        </div>


        <span className="
          absolute
          top-2
          left-2
          rounded
          bg-purple-600
          px-2
          py-1
          text-xs
          text-white
        ">
          {title.quality || "HD"}
        </span>


      </div>


      <h3 className="
        mt-3
        truncate
        font-semibold
        text-white
      ">
        {title.title}
      </h3>


      <p className="text-xs text-zinc-400">
        {title.type === "tv" ? "Série" : "Filme"}
      </p>


    </Link>
  );
}


export function PosterCardSkeleton(){

 return(
  <div className="w-full">
    <div className="skeleton aspect-[2/3] rounded-xl"/>
  </div>
 )

}




























