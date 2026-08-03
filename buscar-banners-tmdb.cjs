const {createClient}=require("@supabase/supabase-js");
const fs=require("fs");

const s=createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const env=fs.readFileSync(".env","utf8");
const TOKEN=env.match(/TMDB_TOKEN=(.*)/)[1].trim();

async function run(){

const {data}=await s
.from("movies")
.select("id,title,tmdb_id")
.is("backdrop_url",null)
.not("tmdb_id","is",null);

console.log("Buscar banners:",data.length);

for(const m of data){

try{

const r=await fetch(
`https://api.themoviedb.org/3/movie/${m.tmdb_id}`,
{
headers:{
Authorization:`Bearer ${TOKEN}`,
accept:"application/json"
}
});

const movie=await r.json();

if(movie.backdrop_path){

const banner=
"https://image.tmdb.org/t/p/original"+
movie.backdrop_path;


await s
.from("movies")
.update({
backdrop_url:banner
})
.eq("id",m.id);


console.log("OK:",m.title);

}else{

console.log("Sem banner:",m.title);

}

}catch(e){

console.log("Erro:",m.title);

}

}

console.log("FINALIZADO");

}

run();
