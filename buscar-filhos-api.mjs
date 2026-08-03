import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

const url =
`https://drive.google.com/drive/u/0/folders/${folder}`;

https.get(url,(res)=>{

let data="";

res.on("data",c=>data+=c);

res.on("end",()=>{

const inicio = data.indexOf("AF_initDataCallback");

const parte = data.substring(inicio);

const encontrados = [
...parte.matchAll(/"([a-zA-Z0-9_-]{20,})",null,null,null,"([^"]+)"/g)
];

console.log("Arquivos:", encontrados.length);

encontrados.forEach(e=>{
 console.log("----------------");
 console.log("ID:",e[1]);
 console.log("Nome:",e[2]);
});

});

});
