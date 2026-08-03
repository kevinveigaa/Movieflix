import https from "https";

const folder = "1_XYeXzYHl_-l3550dvYMbAb9aD8rKct1";

const url = "https://drive.google.com/drive/folders/" + folder + "?usp=sharing";

https.get(url, (res) => {
    let data = "";

    res.on("data", chunk => data += chunk);

    res.on("end", () => {

        const encontrados = [...data.matchAll(/\["([^"]+)",null,null,null,"([^"]+)"/g)];

        console.log("Arquivos encontrados:", encontrados.length);

        encontrados.slice(0,50).forEach(item => {
            console.log("ID:", item[1]);
            console.log("TIPO:", item[2]);
            console.log("----------------");
        });

    });
});
