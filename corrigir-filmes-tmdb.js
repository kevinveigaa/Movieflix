import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";


async function buscarTMDB(id){

 const res = await fetch(
 `https://api.themoviedb.org/3/movie/${id}?language=pt-BR`,
 {
 headers:{
 Authorization:`Bearer ${TMDB_TOKEN}`,
 accept:"application/json"
 }
 });

 return await res.json();

}


async function corrigir(){

 const {data: filmes,error}=await supabase
 .from("movies")
 .select("*");


 if(error){
  console.log(error);
  return;
 }


 console.log("Filmes encontrados:", filmes.length);


 for(const filme of filmes){

  if(!filme.tmdb_id) continue;


  try{

   const tmdb = await buscarTMDB(filme.tmdb_id);


   if(!tmdb.id){
    console.log("TMDB não encontrado:", filme.tmdb_id);
    continue;
   }


   await supabase
   .from("movies")
   .update({

    title: tmdb.title,

    description:
    tmdb.overview ||
    "Filme disponível no MovieFlix",

    poster_url:
    tmdb.poster_path
    ?
    `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    :
    filme.poster_url,

    backdrop_url:
    tmdb.backdrop_path
    ?
    `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    :
    filme.backdrop_url

   })
   .eq("id",filme.id);


   console.log("OK:",tmdb.title);


  }catch(e){

   console.log("Erro:",filme.title,e.message);

  }


 }


}


corrigir();

