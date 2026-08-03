const {createClient}=require("@supabase/supabase-js");
const fs=require("fs");

const s=createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const TOKEN=fs.readFileSync(".env","utf8")
.match(/TMDB_TOKEN=(.*)/)[1].trim();


async function run(){

const {data}=await s
.from("movies")
.select("id,title")
.is("poster_url",null);


console.log("Buscar por nome:",data.length);


for(const m of data){

try{

const r=await fetch(
`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(m.title)}`,
{
headers:{
Authorization:`Bearer ${TOKEN}`,
accept:"application/json"
}
});


const json=await r.json();


if(json.results && json.results.length){

const filme=json.results[0];


if(filme.poster_path){

await s.from("movies")
.update({
tmdb_id:filme.id,
poster_url:
"https://image.tmdb.org/t/p/w500"+filme.poster_path
})
.eq("id",m.id);


console.log("CORRIGIDO:",m.title);

}else{

console.log("Achou sem capa:",m.title);

}


}else{

console.log("Não achou:",m.title);

}


}catch(e){

console.log("Erro:",m.title);

}

}


}

run();
