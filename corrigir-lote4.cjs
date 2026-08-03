const { createClient } = require("@supabase/supabase-js");

const s = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const token="eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMGU0ZmIyNWI3NzI3MDU0NDhhYmY0ZTVlYzczMmYyNCIsIm5iZiI6MTc4NTA5MjMzOS4yODQ5OTk4LCJzdWIiOiI2YTY2NThmM2EyMDliMDk4YTU3OWZiZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kta9VPL2NNlQyXJb5e0R2eGXuIJxborJzRMIiejms3I";


const filmes = {

603:"Meus Quinze Anos",
983:"The Legend of Wild Bill",
2328:"Matei Minha Melhor Amiga",
2349:"Neo Yokio",
2661:"Assassinato no passado",
2664:"Assumindo o Direito",
2706:"Chefes de Guerra",
2733:"Chefe por Acaso",
2784:"Desafiando a Terra",
3111:"O Reino do Superman",
3255:"Pague Para Entrar Reze Para Sair",
3286:"Ponte de Infidelidade",
3290:"Por Falar de Amor",
3403:"Super Velozes e Mega Furiosos",
3450:"Um Tradutor",
3457:"Um Reporter em Apuros",
238:"A Lei de Milo Murphy",
240:"Memorias de um Crime",
247:"O Ultimo Homem Negro em Sao Francisco",
249:"Eu Nao Sou um Assassino",
264:"Elevador Mortal",
612:"Nao Sem Minha Filha",
634:"O Paraiso eh Logo Aqui",
638:"O Retorno do Campeao",
679:"Ruslan Vinganca Explosiva",
695:"Soldado Universal 4",
696:"Showgirls",
712:"Uma Beleza de Salao",
713:"Um Voo Muito Louco",
717:"Um Ninja em Beverly Hills",
754:"007 Só Se Vive 2 Vezes",
773:"Madagascar 2"

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


async function run(){

for(const id in filmes){

console.log("Procurando:",filmes[id]);

const m=await buscar(filmes[id]);

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

run();
