import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

https.get(
"https://drive.google.com/drive/folders/" + folder + "?usp=sharing",
(res)=>{

let data="";

res.on("data", c=>data+=c);

res.on("end", ()=>{

console.log("HTML:", data.length);


const blocos = data.split("AF_initDataCallback");


console.log("Blocos encontrados:", blocos.length);


blocos.forEach((b,i)=>{

if(
 b.includes("video/mp4") ||
 b.includes("S01") ||
 b.includes("E01") ||
 b.includes("The Boys") ||
 b.includes("mp4")
){

console.log("\n====== BLOCO",i,"======");

console.log(
 b.substring(0,3000)
);

}

});


});

});
