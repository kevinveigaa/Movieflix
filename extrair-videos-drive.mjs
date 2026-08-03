import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

https.get(
"https://drive.google.com/drive/folders/" + folder + "?usp=sharing",
(res)=>{

let data="";

res.on("data", c=>data+=c);

res.on("end", ()=>{

console.log("HTML:", data.length);

let pos = data.indexOf("video/mp4");

console.log("posição mp4:", pos);

console.log(data.substring(pos-1000,pos+1000));

});

});
