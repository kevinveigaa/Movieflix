import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://mntyanfhxiqspdedmddb.supabase.co",
  "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const TMDB_TOKEN = process.env.TMDB_TOKEN;

const headers = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  accept: "application/json"
};

function limpar(nome){
 return nome
 .replace(/\b(HD|LEG|4K|3D|OP\d+)\b/gi,"")
 .replace(/[^\w\s]/gi," ")
 .replace(/\s+/g," ")
 .trim();
}

const {data: filmes}=await supabase
.from("movies")
.select("*")
.is("tmdb_id",null);

console.log("Restantes:",filmes.length);


for(const filme of filmes){

 const nome=limpar(filme.title);

 let encontrado=null;

 // filme
 let r=await fetch(
 `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(nome)}&language=pt-BR`,
 {headers}
 );

 let d=await r.json();
 encontrado=d.results?.[0];


 // serie/desenho
 if(!encontrado){

 r=await fetch(
 `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(nome)}&language=pt-BR`,
 {headers}
 );

 d=await r.json();
 encontrado=d.results?.[0];

 }


 if(!encontrado){
 console.log("NÃO ACHOU:",filme.title);
 continue;
 }


 await supabase
 .from("movies")
 .update({
 tmdb_id: encontrado.id,
 description: encontrado.overview,
 poster_url: encontrado.poster_path
 ? `https://image.tmdb.org/t/p/w500${encontrado.poster_path}`
 : null,
 backdrop_url: encontrado.backdrop_path
 ? `https://image.tmdb.org/t/p/original${encontrado.backdrop_path}`
 : null
 })
 .eq("id",filme.id);


 console.log("OK:",filme.title);

}

console.log("FINAL");
