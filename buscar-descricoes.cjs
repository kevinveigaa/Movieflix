const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const s = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const TOKEN=fs.readFileSync(".env","utf8").match(/TMDB_TOKEN=(.*)/)[1].trim();

async function run(){

const {data}=await s
.from("movies")
.select("id,title,tmdb_id")
.or("description.is.null,description.eq.")
.not("tmdb_id","is",null);

console.log("Buscar descrições:",data.length);

for(const m of data){

try{

const r=await fetch(
`https://api.themoviedb.org/3/movie/${m.tmdb_id}?language=pt-BR`,
{
headers:{
Authorization:`Bearer ${TOKEN}`,
accept:"application/json"
}
}
);

const filme=await r.json();

if(filme.overview && filme.overview.trim()){

await s.from("movies")
.update({
description:filme.overview
})
.eq("id",m.id);

console.log("OK:",m.title);

}else{

console.log("Sem descrição:",m.title);

}

}catch{

console.log("Erro:",m.title);

}

}

console.log("FINALIZADO");

}

run();
