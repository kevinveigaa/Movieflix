const { createClient } = require("@supabase/supabase-js");

const s = createClient(
  "https://mntyanfhxiqspdedmddb.supabase.co",
  "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";

async function run(){

 const {data: filmes} = await s
 .from("movies")
 .select("id,title,tmdb_id")
 .not("tmdb_id","is",null)
 .is("poster_url",null);

 console.log("Atualizando:", filmes.length);

 for(const filme of filmes){

   const res = await fetch(
    `https://api.themoviedb.org/3/movie/${filme.tmdb_id}?language=pt-BR`,
    {
     headers:{
      Authorization:`Bearer ${TMDB_TOKEN}`,
      accept:"application/json"
     }
    }
   );

   const tmdb = await res.json();

   if(tmdb.poster_path){

    await s.from("movies")
    .update({
      poster_url:`https://image.tmdb.org/t/p/w500${tmdb.poster_path}`,
      backdrop_url:tmdb.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
      : null
    })
    .eq("id",filme.id);

    console.log("OK:",filme.title);
   }

 }

 console.log("FINALIZADO");
}

run();
