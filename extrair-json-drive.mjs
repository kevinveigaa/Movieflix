import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

https.get(
"https://drive.google.com/drive/folders/" + folder + "?usp=sharing",
(res)=>{

let data="";

res.on("data", c=>data+=c);

res.on("end", ()=>{

console.log("HTML:", data.length);

const termos = [
"application/vnd.google-apps.folder",
"video/mp4",
".mp4",
"The Boys",
"name",
];

termos.forEach(t=>{
 console.log(t, data.indexOf(t));
});


let inicio = data.indexOf("The Boys");

console.log("\nTRECHO:");
console.log(data.substring(inicio, inicio+3000));


});

});
