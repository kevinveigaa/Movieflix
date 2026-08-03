import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

const url =
`https://www.googleapis.com/drive/v3/files?q='${folder}'+in+parents&fields=files(id,name,mimeType)&pageSize=1000`;

https.get(url,(res)=>{

let data="";

res.on("data",c=>data+=c);

res.on("end",()=>{

console.log("status:",res.statusCode);
console.log(data);

});

});
