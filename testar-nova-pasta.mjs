import https from "https";

const folder = "1TB-4ljXmDbF83H9Y4QDqPhKjw4QELQYJ";

https.get(
`https://drive.google.com/drive/folders/${folder}?usp=sharing`,
(res)=>{

let data="";

res.on("data",c=>data+=c);

res.on("end",()=>{

console.log("HTML:",data.length);

console.log("video/mp4:",data.indexOf("video/mp4"));

console.log("mp4:",data.indexOf(".mp4"));

console.log("AF:",data.indexOf("AF_initDataCallback"));

const nomes=[...data.matchAll(/"([^"]+\.(mp4|mkv|avi)[^"]*)"/gi)];

console.log("Vídeos encontrados:",nomes.length);

nomes.forEach(v=>console.log(v[1]));

});

});
