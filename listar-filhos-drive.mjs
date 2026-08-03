import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

const url =
`https://drive.google.com/drive/folders/${folder}?usp=sharing`;

https.get(url,(res)=>{

let data="";

res.on("data",c=>data+=c);

res.on("end",()=>{

const ids = [...data.matchAll(
/"([a-zA-Z0-9_-]{20,})","([^"]+)","([^"]+)"/g
)];

console.log("possíveis arquivos:", ids.length);

ids.slice(0,50).forEach(x=>{

console.log("----------------");
console.log("ID:",x[1]);
console.log("campo2:",x[2]);
console.log("campo3:",x[3]);

});

});

});
