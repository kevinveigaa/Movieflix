const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://mntyanfhxiqspdedmddb.supabase.co";
const SUPABASE_KEY = "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn";
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function limparTitulo(titulo) {
  return titulo
    .replace(/[🔥❌⚡🎬⭐]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[:\-]/g, " ")
    .trim();
}

async function buscarTMDB(titulo) {

  const nome = limparTitulo(titulo);

  const url =
    `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(nome)}&language=pt-BR`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`
    }
  });

  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    return null;
  }

  return data.results[0];
}


async function iniciar(){

 const {data: filmes,error}=await supabase
 .from("movies")
 .select("*")
 .is("tmdb_id",null);


 if(error){
  console.log(error);
  return;
 }


 console.log("Pendentes:", filmes.length);


 for(const filme of filmes){

   const tmdb = await buscarTMDB(filme.title);


   if(!tmdb){
     console.log("SEM TMDB:", filme.title);
     continue;
   }


   await supabase
   .from("movies")
   .update({

    tmdb_id: tmdb.id,

    poster_url: tmdb.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    : filme.poster_url,


    backdrop_url: tmdb.backdrop_path
    ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    : filme.backdrop_url,


    description: tmdb.overview || filme.description

   })
   .eq("id",filme.id);


   console.log("OK:",filme.title,"->",tmdb.id);


   await new Promise(r=>setTimeout(r,300));

 }

}

iniciar();
