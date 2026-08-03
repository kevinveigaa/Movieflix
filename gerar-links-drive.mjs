import fs from "fs";

const series = JSON.parse(
  fs.readFileSync("series.json","utf8")
);

const resultado = series.map(video=>{

return {
 nome: video.nome,

 id: video.id,

 url:
 `https://drive.google.com/file/d/${video.id}/preview`
};

});


fs.writeFileSync(
"series-links.json",
JSON.stringify(resultado,null,2)
);


console.log(
"Gerado:",
resultado.length,
"vídeos"
);

