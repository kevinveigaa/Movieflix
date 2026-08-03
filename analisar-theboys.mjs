import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

https.get(
"https://drive.google.com/drive/folders/" + folder + "?usp=sharing",
(res)=>{

 let data="";

 res.on("data", c=>data+=c);

 res.on("end",()=>{

    console.log("tamanho html:", data.length);

    const mp4 = data.match(/[^"]+\.mp4/gi);

    console.log("MP4 encontrados:");

    console.log(mp4);

    const nomes = [...data.matchAll(/"([^"]+\.(mp4|mkv|avi)[^"]*)"/gi)];

    console.log("VIDEOS:");

    nomes.forEach(v=>{
       console.log(v[1]);
    });

 });

});
