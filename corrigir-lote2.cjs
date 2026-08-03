const { createClient } = require("@supabase/supabase-js");

const s = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const token="eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";

const filmes = {
288:"Peppa Pig George's New Dinosaur",
525:"Beast Wars",
567:"Gloria",
603:"Meus Quinze Anos",
983:"The Legend of Wild Bill",
1507:"Forbidden Ground",
1638:"Yucatán",
1829:"Final Fantasy XV Kingsglaive",
1840:"He Even Has Your Eyes",
2044:"Robinson Crusoe",
2128:"Uma Noite em Sampa",
2181:"Uma Razão Para Vencer",
2184:"Modern Life Is Rubbish",
2239:"Cyborgs Heroes Never Die",
2328:"Matei Minha Melhor Amiga",
2349:"Neo Yokio",
2582:"A Madea Christmas",
2595:"A Série Divergente Convergente",
2661:"Assassinato no Passado",
2664:"Assumindo o Direito",
2693:"Boa Noite Mamãe",
2706:"Chefes de Guerra",
2733:"Chefe por Acaso",
2757:"Confronto Final",
2770:"Dívida de Honra",
2773:"Daylight",
2784:"Desafiando a Terra",
2794:"Decisão de Risco",
2828:"Ele Está de Volta",
2856:"I Saw the Light",
2860:"Exército do Pai",
2865:"Fantasmas à Solta",
2892:"Godzilla King of the Monsters",
2912:"Honey",
2917:"Hotel Transylvania 3",
2934:"Irmã Natureza",
2935:"Irmão de Espião",
2938:"Jackie & Ryan",
2978:"LEGO Justice League Gotham City Breakout",
2993:"Lua Cheia O Terror das Virgens",
3000:"Mad Max Fury Road",
3006:"Mais Fortes que Bombas",
3023:"McFarland USA",
3040:"Minha Fé e Eu",
3055:"Monster High Welcome to Monster High",
3075:"Naomi & Ely's No Kiss List",
3076:"Nascido Para Morrer",
3081:"Negócios das Arábias",
3085:"Nerds 2"
};


async function buscar(nome){

let r=await fetch(
`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(nome)}&language=pt-BR`,
{
headers:{
Authorization:`Bearer ${token}`
}
});

let j=await r.json();

return j.results?.[0];

}


async function start(){

for(let id in filmes){

console.log("Buscando:",filmes[id]);

let m=await buscar(filmes[id]);

if(m){

await s.from("movies").update({

tmdb_id:m.id,

poster_url:m.poster_path?
`https://image.tmdb.org/t/p/w500${m.poster_path}`:null,

backdrop_url:m.backdrop_path?
`https://image.tmdb.org/t/p/original${m.backdrop_path}`:null

}).eq("id",id);

console.log("OK:",filmes[id]);

}else{

console.log("NÃO ACHOU:",filmes[id]);

}

}

console.log("FINALIZADO");

}

start();
