const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udHlhbmZoeGlxc3BkZWRtZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTA5MzEsImV4cCI6MjEwMTAyNjkzMX0.FxGmpM7-PIwj-XP-l6KC2G0L425X7e2zANGS03xrbr0"
);

const TMDB_TOKEN =
"eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";


function limpar(nome){
return nome
.normalize("NFD")
.replace(/[\u0300-\u036f]/g,"")
.replace(/[🔥❌⭐🎬]/g,"")
.trim();
}


async function buscar(nome){

const tentativas=[
nome,
limpar(nome),
limpar(nome).split(":")[0]
];


for(const termo of tentativas){

const resposta = await fetch(
`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(termo)}&language=pt-BR`,
{
headers:{
Authorization:`Bearer ${TMDB_TOKEN}`
}
}
);


const json=await resposta.json();


const encontrado=json.results?.find(
x=>x.media_type==="movie"
);


if(encontrado){
return encontrado;
}

}

return null;

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


console.log("Pendentes:",filmes.length);


for(const filme of filmes){

const tmdb=await buscar(filme.title);


if(!tmdb){

console.log("SEM:",filme.title);
continue;

}


await supabase
.from("movies")
.update({

tmdb_id:tmdb.id,

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
filme.backdrop_url,

description:
tmdb.overview || filme.description

})
.eq("id",filme.id);


console.log("OK:",filme.title,"=>",tmdb.id);


await new Promise(r=>setTimeout(r,400));

}

}

iniciar();
