const { createClient } = require("@supabase/supabase-js");

const s = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const token="eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";


const filmes = {

288:"Peppa Pig George's New Dinosaur",
603:"Meus Quinze Anos",
983:"The Legend of Wild Bill",
2328:"Matei Minha Melhor Amiga",
2349:"Neo Yokio",
2661:"Assassinato no passado",
2664:"Assumindo o direito",
2706:"Chefes de Guerra",
2733:"Chefe por acaso",
2784:"Desafiando a Terra",
2934:"Irma Natureza",
2993:"Lua Cheia O Terror das Virgens",
3006:"Mais Fortes que Bombas",
3040:"Minha Fé e Eu",
3076:"Nascido Para Morrer",
3081:"Negócios das Arábias",
3107:"O Quarto dos Esquecidos",
3111:"O Reino do Superman",
3148:"The Stanford Prison Experiment",
3229:"Os Batutinhas Uma Nova Aventura",
3255:"Pague para entrar e reze para sair",
3268:"Peppa Pig George",
3284:"Ponte para Terabithia",
3286:"Ponte de Infidelidade",
3290:"Por Falar de Amor",
3334:"Ricki and the Flash",
3381:"Skin Trade",
3400:"Stitches",
3403:"Super Velozes e Mega Furiosos",
3450:"Um Tradutor",
3457:"Um Repórter em Apuros",
3476:"Verão em Staten Island",
238:"A Lei de Milo Murphy",
240:"Memórias de um Crime",
247:"O Último Homem Negro em São Francisco",
249:"Eu Não Sou um Assassino",
264:"Elevador Mortal",
423:"Crepúsculo Amanhecer Parte 1",
424:"Crepúsculo Amanhecer Parte 2",
612:"Não Sem Minha Filha",
614:"Nem Tudo é o Que Parece"

};


async function buscar(nome){

const r = await fetch(
`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(nome)}&language=pt-BR`,
{
headers:{
Authorization:`Bearer ${token}`
}
});

const j=await r.json();

return j.results?.[0];

}


async function iniciar(){

for(const id in filmes){

console.log("Buscando:",filmes[id]);

const m=await buscar(filmes[id]);

if(m){

await s.from("movies")
.update({
tmdb_id:m.id,
poster_url:m.poster_path ? 
`https://image.tmdb.org/t/p/w500${m.poster_path}`:null,
backdrop_url:m.backdrop_path ?
`https://image.tmdb.org/t/p/original${m.backdrop_path}`:null
})
.eq("id",id);


console.log("OK",filmes[id]);

}else{

console.log("NÃO ACHOU",filmes[id]);

}

}

console.log("FINALIZADO");

}

iniciar();
