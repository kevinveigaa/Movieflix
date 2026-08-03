import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

https.get("https://drive.google.com/drive/folders/" + folder + "?usp=sharing", (res)=>{

 let data="";

 res.on("data", c=>data+=c);

 res.on("end",()=>{

    const ids=[...data.matchAll(/"([a-zA-Z0-9_-]{20,})"/g)]
    .map(x=>x[1]);

    console.log("IDs encontrados:", ids.length);

    console.log(ids.slice(0,30));

 });

});
