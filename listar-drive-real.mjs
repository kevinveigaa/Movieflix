import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

const url =
`https://drive.google.com/drive/api/v2/files?q='${folder}'+in+parents&maxResults=1000`;

https.get(url,(res)=>{

let data="";

res.on("data",c=>data+=c);

res.on("end",()=>{

console.log("status:",res.statusCode);
console.log(data.substring(0,1000));

});

});
