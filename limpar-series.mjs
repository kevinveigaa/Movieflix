import fs from "fs";

const series = JSON.parse(
 fs.readFileSync("series-links.json","utf8")
);


const limpo = [];

const usados = new Set();


for(const video of series){

 let episodio = video.nome
 .match(/S\d+E\d+/)?.[0];


 if(!episodio) continue;


 if(!usados.has(episodio)){

  usados.add(episodio);

  limpo.push({
   episodio,
   nome: video.nome,
   id: video.id,
   url: video.url
  });

 }

}


fs.writeFileSync(
"series-final.json",
JSON.stringify(limpo,null,2)
);


console.log(
"Final:",
limpo.length,
"episódios"
);

