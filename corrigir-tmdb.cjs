const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://mntyanfhxiqspdedmddb.supabase.co",
  "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";


function limparTitulo(titulo){
  return titulo
    .replace(/\bHD\b/gi,"")
    .replace(/\bLEG\b/gi,"")
    .replace(/\bDublado\b/gi,"")
    .replace(/\bDual\b/gi,"")
    .replace(/\bWEB-DL\b/gi,"")
    .replace(/\b4K\b/gi,"")
    .replace(/\(\d{4}\)/g,"")
    .replace(/\d{4}/g,"")
    .trim();
}


async function buscar(titulo){

 try{

  const nome = limparTitulo(titulo);

  const res = await fetch(
   `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(nome)}&language=pt-BR`,
   {
    headers:{
     Authorization:`Bearer ${TMDB_TOKEN}`,
     accept:"application/json"
    }
   }
  );

  const data = await res.json();

  return data.results?.[0] || null;

 }catch{
  return null;
 }

}



async function iniciar(){

 const {data: filmes}=await supabase
 .from("movies")
 .select("id,title")
 .is("tmdb_id",null);


 console.log("Faltando:",filmes.length);


 for(const filme of filmes){

  console.log("Procurando:",filme.title);

  const tmdb=await buscar(filme.title);


  if(tmdb){

   await supabase
   .from("movies")
   .update({
    tmdb_id:tmdb.id,
    poster_url:tmdb.poster_path
    ?`https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
    :null,
    backdrop_url:tmdb.backdrop_path
    ?`https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
    :null
   })
   .eq("id",filme.id);


   console.log("OK:",filme.title);

  }else{

   console.log("Não achou:",filme.title);

  }

 }

 console.log("FINALIZADO");

}


iniciar();
