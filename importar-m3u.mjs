import fs from "fs";
const arquivo = "K:\\downlods kewvin\\filmesdublado1\\064c866a0a5c3dcc38be6c7549c5ce90-6179acda4a259b85f39248e3fb1af876aeb87105\\Lista1dub";
const texto = fs.readFileSync(arquivo, "utf8");
const linhas = texto.split("\n");
let filmes = [];
for (let i = 0; i < linhas.length; i++) {
if (linhas[i].startsWith("#EXTINF")) {
let nome = linhas[i].split(",").pop().trim();
let url = linhas[i+1]?.trim();
if(url && url.startsWith("http")) filmes.push({nome,url});
}
}
console.log("Total encontrados:", filmes.length);
console.log(filmes.slice(0,10));
