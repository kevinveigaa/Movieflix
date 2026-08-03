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
.is("poster_url",null)
.not("tmdb_id","is",null);

console.log("Buscar imagens:",data.length);

for(const m of data){

try{

const r=await fetch(
`https://api.themoviedb.org/3/movie/${m.tmdb_id}/images`,
{
headers:{
Authorization:`Bearer ${TOKEN}`,
accept:"application/json"
}
});

const img=await r.json();

if(img.posters && img.posters.length){

const poster=
"https://image.tmdb.org/t/p/w500"+
img.posters[0].file_path;


await s.from("movies")
.update({
poster_url:poster
})
.eq("id",m.id);


console.log("OK:",m.title);

}else{

console.log("Sem imagem:",m.title);

}

}catch(e){

console.log("Erro:",m.title);

}

}

console.log("FINALIZADO");

}

run();
