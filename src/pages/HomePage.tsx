import { PosterCard, PosterCardSkeleton } from "@/components/cards/PosterCard";
import { useMovies } from "@/hooks/useMovies";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { Crown, Sparkles } from "lucide-react";

export function HomePage(){

const {subscription}=useAuth();

const movies = useMovies("movie");

const getMainCategory = (movie:any) => {
  const categories = movie.category
    ?.split(",")
    .map((c:string)=>c.trim()) || [];

  if (categories.includes("Ação")) return "Ação";
  if (categories.includes("Terror")) return "Terror";
  if (categories.includes("Comédia")) return "Comédia";
  if (categories.includes("Drama")) return "Drama";
  if (categories.includes("Ficção Científica")) return "Ficção Científica";

  return categories[0] || "Outros";
};


const categorias = [
{
nome:"Filmes em destaque",
lista: movies.data?.slice(0,10)
},
{
nome:"Ação",
lista: movies.data?.filter(m=>getMainCategory(m)==="Ação").slice(0,10)
},
{
nome:"Aventura",
lista: movies.data?.filter(m=>getMainCategory(m)==="Aventura").slice(0,10)
},
{
nome:"Ficção Científica",
lista: movies.data?.filter(m=>getMainCategory(m)==="Ficção Científica").slice(0,10)
},
{
nome:"Terror",
lista: movies.data?.filter(m=>getMainCategory(m)==="Terror").slice(0,10)
},
{
nome:"Comédia",
lista: movies.data?.filter(m=>getMainCategory(m)==="Comédia").slice(0,10)
}
];


return (

<div className="container-app pt-8 pb-16 space-y-10">


{!hasActiveSubscription(subscription) && (
<UpgradeBanner/>
)}


{categorias.filter(cat=>cat.lista?.length).map((cat)=>(

<section key={cat.nome}>

<h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-4 sm:mb-5">
{cat.nome}
</h2>


<div className="
grid
grid-cols-3
xs:grid-cols-3
sm:grid-cols-4
md:grid-cols-5
lg:grid-cols-6
xl:grid-cols-7
gap-3
sm:gap-4
lg:gap-5
">

{movies.isLoading ? (

<>
<PosterCardSkeleton/>
<PosterCardSkeleton/>
<PosterCardSkeleton/>
<PosterCardSkeleton/>
<PosterCardSkeleton/>
</>

):(


cat.lista?.map(movie=>(

<PosterCard

key={movie.id}

title={{
id:movie.id,
title:movie.title,
description:movie.description,
poster_url:movie.poster_url,
quality:movie.quality ?? "HD",
type:movie.type ?? "movie"

}}

/>

))


)}


</div>


</section>

))}


</div>

)

}



function UpgradeBanner(){

return(

<Link
to="/minha-assinatura"
className="
flex items-center gap-4
rounded-2xl
bg-gradient-to-r
from-purple-900
to-black
p-5
border
border-purple-600/30
"
>

<div className="
bg-purple-600
rounded-xl
p-3
">

<Crown/>

</div>


<div>

<h3 className="text-white font-bold flex gap-2">
<Sparkles/>
Desbloqueie todo conteúdo
</h3>

<p className="text-gray-400">
Assine e assista sem limites
</p>

</div>


</Link>

)

}









