import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

const url =
"https://drive.google.com/drive/folders/" + folder + "?usp=sharing";

https.get(url,(res)=>{

let data="";

res.on("data",c=>data+=c);

res.on("end",()=>{

const inicio = data.indexOf("AF_initDataCallback");

console.log("AF encontrado:", inicio);

console.log(data.substring(inicio, inicio+5000));

});

});
