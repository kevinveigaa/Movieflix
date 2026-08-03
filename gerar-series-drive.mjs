import https from "https";
import fs from "fs";

const folder = "1TB-4ljXmDbF83H9Y4QDqPhKjw4QELQYJ";

https.get(
`https://drive.google.com/drive/folders/${folder}?usp=sharing`,
(res)=>{

let data="";

res.on("data",c=>data+=c);

res.on("end",()=>{


const regex = /"(1[A-Za-z0-9_-]{20,})".*?"([^"]+S\d+E\d+[^"]+\.(?:avi|mp4|mkv))"/g;


let encontrados=[];

let m;

while((m=regex.exec(data))!==null){

encontrados.push({
id:m[1],
nome:m[2]
});

}


console.log("Encontrados:", encontrados.length);


fs.writeFileSync(
"series.json",
JSON.stringify(encontrados,null,2)
);


console.log("series.json criado!");

});

});
