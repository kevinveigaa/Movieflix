import https from "https";

const folder = "1_XYeXzYHl_-l3550dvYMbAb9aD8rKct1";

https.get("https://drive.google.com/drive/folders/" + folder + "?usp=sharing", (res) => {
    let data = "";

    res.on("data", c => data += c);

    res.on("end", () => {

        const regex = /"([a-zA-Z0-9_-]{20,})".{0,200}?\[\["([^"]+)"/g;

        let achados = [];
        let m;

        while ((m = regex.exec(data)) !== null) {
            achados.push({
                id: m[1],
                nome: m[2]
            });
        }

        console.log("Encontrados:", achados.length);

        console.log(achados.slice(0,50));

    });
});
