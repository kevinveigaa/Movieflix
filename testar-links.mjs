import fs from "fs";
const arquivo="K:\\downlods kewvin\\filmesdublado1\\064c866a0a5c3dcc38be6c7549c5ce90-6179acda4a259b85f39248e3fb1af876aeb87105\\Lista1dub";
const texto=fs.readFileSync(arquivo,"utf8");
const linhas=texto.split("\n");
let links=[];
for(let i=0;i<linhas.length;i++){
if(linhas[i].startsWith("#EXTINF")){
let nome=linhas[i].split(",").pop().trim();
let url=linhas[i+1]?.trim();
if(url&&url.startsWith("http")) links.push({nome,url});
}}
console.log("Total links:",links.length);
for(const filme of links.slice(0,20)){
try{
let r=await fetch(filme.url,{method:"HEAD"});
console.log(r.status,filme.nome);
