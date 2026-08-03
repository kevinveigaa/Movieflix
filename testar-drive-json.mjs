import https from "https";

const folder = "15quP0XSNOTpby98BA1ThZPxmUY_MXu58";

const url = "https://drive.google.com/drive/folders/" + folder;

https.get(url, (res)=>{

 let data="";

 res.on("data", c=>data+=c);

 res.on("end", ()=>{

    const index = data.indexOf("The Boys");

    console.log("posição:", index);

    console.log(data.substring(index-500,index+500));

 });

});
