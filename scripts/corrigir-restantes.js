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

function limparNome(nome){
  return nome
    .replace(/\b(HD|LEG|4K|3D|OP\d+)\b/gi,"")
    .replace(/[^\w\s]/gi," ")
    .replace(/\s+/g," ")
    .trim();
}

const {data: filmes} = await supabase
.from("movies")
.select("*")
.is("tmdb_id",null);

console.log("Restantes:", filmes.length);

for(const filme of filmes){

 const nome = limparNome(filme.title);

 let resposta = await fetch(
 `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(nome)}&language=pt-BR`,
 {headers}
 );

 let dados = await resposta.json();

 let encontrado = dados.results?.[0];

 if(!encontrado){
   // Titulo em pt-BR e obrigatorio (audio dublado pt-BR); sem fallback en-US.
   console.log("NÃO ACHOU:", filme.title);
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

console.log("FINALIZADO");
